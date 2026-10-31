/* =====================================================================
   Objeto   : dbo.SP_Orders_List
   Version  : 1.1.0
   Cambio   : El total ya no se calcula con COUNT(*) OVER () (un Window Spool que escribía cada fila en tempdb); se cuenta aparte y solo
              se leen las filas de la página; un camino y un plan distintos para el cliente (sus pedidos) y para el personal (todos)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Mismas columnas y mismo orden que 1.0.0. Con 50 000 pedidos pasó de 135 000-483 000 lecturas lógicas a 212-498. Un cliente
              (@AsStaff = 0) solo ve los suyos: se filtra por @IDActor, que el backend toma del token, y no
              por ningún dato de la solicitud. Errores: 50400 paginación o rango inválidos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Orders_List
  @IDActor       INT,
  @AsStaff       BIT          = 0,
  @IDOrderStatus TINYINT      = NULL,
  -- Solo personal: número de pedido o correo del cliente, como texto literal
  @Search        NVARCHAR(100) = NULL,
  @From          DATETIME2(3) = NULL,
  @To            DATETIME2(3) = NULL,
  @PageNumber    INT          = 1,
  @PageSize      INT          = 20
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDActor IS NULL OR @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'IDActor is required, PageNumber must be at least 1 and PageSize between 1 and 100.', 1;
  IF @From IS NOT NULL AND @To IS NOT NULL AND @From >= @To
    THROW 50400, 'From must be before To.', 1;

  SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');

  -- Dos caminos con dos planes. Con una sola consulta y (@AsStaff = 1 OR IDUser = @IDActor), el primer llamador fijaba el plan
  -- de todos: si era el personal, cada cliente recorría la tabla entera para encontrar sus pedidos (164 ms en vez de 11); si
  -- era un cliente, el personal buscaba por un cliente que no existe. El cliente, que es la ruta más frecuente, tiene un plan
  -- estable que siempre usa IX_Orders_User y no paga una compilación por llamada; el personal, con filtros opcionales muy
  -- distintos entre sí, usa RECOMPILE. El total se cuenta aparte (COUNT(*) OVER () escribía todas las filas en tempdb) y
  -- ItemCount se calcula solo para las filas de la página. CHARINDEX y no LIKE: lo que escribe el usuario no es un patrón.
  DECLARE @Page TABLE (Position INT IDENTITY(1,1) PRIMARY KEY, IDOrder INT NOT NULL);
  DECLARE @Total INT;

  IF @AsStaff = 0
  BEGIN
    -- Un cliente nunca busca por texto: con @Search no hay resultados, igual que antes
    SELECT @Total = COUNT(*)
    FROM dbo.Orders AS o
    WHERE o.IDUser = @IDActor AND @Search IS NULL
      AND (@IDOrderStatus IS NULL OR o.IDOrderStatus = @IDOrderStatus)
      AND (@From IS NULL OR o.CreatedAt >= @From)
      AND (@To IS NULL OR o.CreatedAt < @To);

    INSERT INTO @Page (IDOrder)
    SELECT o.IDOrder
    FROM dbo.Orders AS o
    WHERE o.IDUser = @IDActor AND @Search IS NULL
      AND (@IDOrderStatus IS NULL OR o.IDOrderStatus = @IDOrderStatus)
      AND (@From IS NULL OR o.CreatedAt >= @From)
      AND (@To IS NULL OR o.CreatedAt < @To)
    ORDER BY o.IDOrder DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
  END
  ELSE IF @Search IS NULL
  BEGIN
    -- Personal sin texto de búsqueda, el caso habitual: solo estado y fechas. Es una rama aparte porque un predicado con
    -- CHARINDEX(@Search, ...) no se pliega aunque @Search sea nulo y el conteo pasaba de leer un índice angosto (219 páginas)
    -- a leer toda la tabla de pedidos (1 388). RECOMPILE porque los filtros opcionales cambian cuál es el mejor plan.
    SELECT @Total = COUNT(*)
    FROM dbo.Orders AS o
    WHERE (@IDOrderStatus IS NULL OR o.IDOrderStatus = @IDOrderStatus)
      AND (@From IS NULL OR o.CreatedAt >= @From)
      AND (@To IS NULL OR o.CreatedAt < @To)
    OPTION (RECOMPILE);

    INSERT INTO @Page (IDOrder)
    SELECT o.IDOrder
    FROM dbo.Orders AS o
    WHERE (@IDOrderStatus IS NULL OR o.IDOrderStatus = @IDOrderStatus)
      AND (@From IS NULL OR o.CreatedAt >= @From)
      AND (@To IS NULL OR o.CreatedAt < @To)
    ORDER BY o.IDOrder DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
    OPTION (RECOMPILE);
  END
  ELSE
  BEGIN
    -- Personal buscando por número de pedido o por correo del cliente. Buscar texto obliga a recorrer los pedidos de todos
    -- modos, y el JOIN por hash lee las cuentas una vez. Sin la sugerencia, el optimizador esperaba hallar coincidencias pronto
    -- (TOP) y buscaba la cuenta de cada pedido por separado: 106 000 lecturas con 50 000 pedidos. Un EXISTS por pedido costaba 200 000.
    SELECT @Total = COUNT(*)
    FROM dbo.Orders AS o
    JOIN dbo.Users AS u ON u.IDUser = o.IDUser
    WHERE (@IDOrderStatus IS NULL OR o.IDOrderStatus = @IDOrderStatus)
      AND (CHARINDEX(@Search, o.OrderNumber) > 0 OR CHARINDEX(@Search, u.Email) > 0)
      AND (@From IS NULL OR o.CreatedAt >= @From)
      AND (@To IS NULL OR o.CreatedAt < @To)
    OPTION (RECOMPILE, HASH JOIN);

    INSERT INTO @Page (IDOrder)
    SELECT o.IDOrder
    FROM dbo.Orders AS o
    JOIN dbo.Users AS u ON u.IDUser = o.IDUser
    WHERE (@IDOrderStatus IS NULL OR o.IDOrderStatus = @IDOrderStatus)
      AND (CHARINDEX(@Search, o.OrderNumber) > 0 OR CHARINDEX(@Search, u.Email) > 0)
      AND (@From IS NULL OR o.CreatedAt >= @From)
      AND (@To IS NULL OR o.CreatedAt < @To)
    ORDER BY o.IDOrder DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
    OPTION (RECOMPILE, HASH JOIN);
  END;

  SELECT o.IDOrder, o.OrderNumber, o.IDUser, CustomerName = u.FullName, CustomerEmail = u.Email,
         o.IDOrderStatus, StatusName = s.Name,
         Total = CAST(o.Total AS VARCHAR(25)),
         ItemCount = (SELECT SUM(l.Quantity) FROM dbo.OrderLines AS l WITH (INDEX(IX_OrderLines_Order)) WHERE l.IDOrder = o.IDOrder),
         o.CreatedAt, o.PaidAt, o.RequestedDeliveryDate,
         TotalCount = @Total
  FROM @Page AS pg
  JOIN dbo.Orders AS o ON o.IDOrder = pg.IDOrder
  JOIN dbo.Users AS u ON u.IDUser = o.IDUser
  JOIN dbo.OrderStatuses AS s ON s.IDOrderStatus = o.IDOrderStatus
  ORDER BY pg.Position;
END;
GO
