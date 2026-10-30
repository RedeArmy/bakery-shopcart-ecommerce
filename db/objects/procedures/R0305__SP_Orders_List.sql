/* =====================================================================
   Objeto   : dbo.SP_Orders_List
   Version  : 1.0.0
   Cambio   : Primera versión: lista paginada de pedidos, propios del cliente o todos para el personal
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un cliente (@AsStaff = 0) solo ve los suyos: se filtra por @IDActor, que el backend toma del token, y no
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

  -- CHARINDEX y no LIKE: lo que escribe el usuario nunca se interpreta como patrón
  SELECT o.IDOrder, o.OrderNumber, o.IDUser, CustomerName = u.FullName, CustomerEmail = u.Email,
         o.IDOrderStatus, StatusName = s.Name,
         Total = CAST(o.Total AS VARCHAR(25)),
         ItemCount = (SELECT SUM(l.Quantity) FROM dbo.OrderLines AS l WITH (INDEX(IX_OrderLines_Order)) WHERE l.IDOrder = o.IDOrder),
         o.CreatedAt, o.PaidAt, o.RequestedDeliveryDate,
         TotalCount = COUNT(*) OVER ()
  FROM dbo.Orders AS o
  JOIN dbo.Users AS u ON u.IDUser = o.IDUser
  JOIN dbo.OrderStatuses AS s ON s.IDOrderStatus = o.IDOrderStatus
  WHERE (@AsStaff = 1 OR o.IDUser = @IDActor)
    AND (@IDOrderStatus IS NULL OR o.IDOrderStatus = @IDOrderStatus)
    AND (@Search IS NULL OR (@AsStaff = 1 AND (CHARINDEX(@Search, o.OrderNumber) > 0 OR CHARINDEX(@Search, u.Email) > 0)))
    AND (@From IS NULL OR o.CreatedAt >= @From)
    AND (@To IS NULL OR o.CreatedAt < @To)
  ORDER BY o.IDOrder DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
