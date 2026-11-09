/* =====================================================================
   Objeto   : dbo.SP_Payments_ListPendingDeposits
   Version  : 1.3.0
   Cambio   : El total ya no se calcula con COUNT(*) OVER () (un Window Spool que escribía cada fila en tempdb); se cuenta aparte y solo se leen
              las filas de la página; sin RECOMPILE: la cola en revisión (la consulta frecuente de los operadores) pasaba de 25 a 70 ms por compilar 8 tablas
   Cambio 1.2.0: los depósitos se reconocen por la clase del método y la cuenta es opcional (V0017): sin cuenta, sus columnas salen NULL.
   Cambio 1.3.0: @Search (al final, opcional) busca por número de pedido, nombre o correo del cliente, para atender a quien dice "ya envié mi
              comprobante del pedido tal". Sin texto, el camino y el plan son los de siempre; con texto, otra rama con RECOMPILE, como SP_Orders_List.
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Mismas columnas y mismo orden que 1.0.0; el parámetro nuevo va al final y es opcional. Por defecto lista los depósitos en revisión
              (estado 2), los más antiguos primero con su antigüedad en horas; con otro estado sirve de historial. @Search es texto literal
              (CHARINDEX, no un patrón). Errores: 50400 paginación o rango inválidos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_ListPendingDeposits
  @IDPaymentStatus TINYINT       = 2,
  @From            DATETIME2(3)  = NULL,
  @To              DATETIME2(3)  = NULL,
  @Now             DATETIME2(3)  = NULL,
  @PageNumber      INT           = 1,
  @PageSize        INT           = 20,
  @Search          NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;
  IF @From IS NOT NULL AND @To IS NOT NULL AND @From >= @To
    THROW 50400, 'From must be before To.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');

  -- Se ordena de lo más antiguo a lo más nuevo en revisión (primero en llegar, primero en atenderse) y al revés en el historial.
  -- La página se guarda aparte y el total se cuenta una vez: así los dos caminos comparten el SELECT final.
  DECLARE @Page TABLE (Position INT IDENTITY(1,1) PRIMARY KEY, IDPayment INT NOT NULL);
  DECLARE @Total INT;

  IF @Search IS NULL
  BEGIN
    SELECT @Total = COUNT(*)
    FROM dbo.Payments AS p
    WHERE p.IDPaymentMethod IN (SELECT IDPaymentMethod FROM dbo.PaymentMethods WHERE Kind = N'Deposit') AND p.IDPaymentStatus = @IDPaymentStatus
      AND (@From IS NULL OR p.CreatedAt >= @From)
      AND (@To IS NULL OR p.CreatedAt < @To);

    INSERT INTO @Page (IDPayment)
    SELECT p.IDPayment
    FROM dbo.Payments AS p
    WHERE p.IDPaymentMethod IN (SELECT IDPaymentMethod FROM dbo.PaymentMethods WHERE Kind = N'Deposit') AND p.IDPaymentStatus = @IDPaymentStatus
      AND (@From IS NULL OR p.CreatedAt >= @From)
      AND (@To IS NULL OR p.CreatedAt < @To)
    ORDER BY CASE WHEN @IDPaymentStatus = 2 THEN p.IDPayment END ASC,
             CASE WHEN @IDPaymentStatus <> 2 THEN p.IDPayment END DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
  END
  ELSE
  BEGIN
    -- Buscar texto obliga a mirar el pedido y el cliente de cada pago del estado. Sin la sugerencia el optimizador buscaba el pedido de cada
    -- pago por separado (más de 100 000 lecturas con 50 000 pedidos en el historial); el JOIN por hash lee cada tabla una vez, como en SP_Orders_List.
    SELECT @Total = COUNT(*)
    FROM dbo.Payments AS p
    JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
    JOIN dbo.Users AS u ON u.IDUser = o.IDUser
    WHERE p.IDPaymentMethod IN (SELECT IDPaymentMethod FROM dbo.PaymentMethods WHERE Kind = N'Deposit') AND p.IDPaymentStatus = @IDPaymentStatus
      AND (@From IS NULL OR p.CreatedAt >= @From)
      AND (@To IS NULL OR p.CreatedAt < @To)
      AND (CHARINDEX(@Search, o.OrderNumber) > 0 OR CHARINDEX(@Search, u.Email) > 0 OR CHARINDEX(@Search, u.FullName) > 0)
    OPTION (RECOMPILE, HASH JOIN);

    INSERT INTO @Page (IDPayment)
    SELECT p.IDPayment
    FROM dbo.Payments AS p
    JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
    JOIN dbo.Users AS u ON u.IDUser = o.IDUser
    WHERE p.IDPaymentMethod IN (SELECT IDPaymentMethod FROM dbo.PaymentMethods WHERE Kind = N'Deposit') AND p.IDPaymentStatus = @IDPaymentStatus
      AND (@From IS NULL OR p.CreatedAt >= @From)
      AND (@To IS NULL OR p.CreatedAt < @To)
      AND (CHARINDEX(@Search, o.OrderNumber) > 0 OR CHARINDEX(@Search, u.Email) > 0 OR CHARINDEX(@Search, u.FullName) > 0)
    ORDER BY CASE WHEN @IDPaymentStatus = 2 THEN p.IDPayment END ASC,
             CASE WHEN @IDPaymentStatus <> 2 THEN p.IDPayment END DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
    OPTION (RECOMPILE, HASH JOIN);
  END;

  SELECT p.IDPayment, p.IDOrder, o.OrderNumber, CustomerName = u.FullName, CustomerEmail = u.Email,
         Amount = CAST(p.Amount AS VARCHAR(25)), p.IDPaymentStatus, StatusName = s.Name,
         b.BankName, d.ReferenceNumber, d.DepositDate, DepositedAmount = CAST(d.DepositedAmount AS VARCHAR(25)),
         d.RejectionReason, proof.IDPaymentProof, SubmittedAt = proof.UploadedAt,
         AgeHours = DATEDIFF(HOUR, proof.UploadedAt, @Now),
         TotalCount = @Total
  FROM @Page AS pg
  JOIN dbo.Payments AS p ON p.IDPayment = pg.IDPayment
  JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
  JOIN dbo.Users AS u ON u.IDUser = o.IDUser
  JOIN dbo.PaymentStatuses AS s ON s.IDPaymentStatus = p.IDPaymentStatus
  JOIN dbo.PaymentDeposits AS d ON d.IDPayment = p.IDPayment
  LEFT JOIN dbo.BankAccounts AS b ON b.IDBankAccount = d.IDBankAccount
  OUTER APPLY (SELECT TOP (1) pr.IDPaymentProof, pr.UploadedAt FROM dbo.PaymentProofs AS pr
               WHERE pr.IDPayment = p.IDPayment ORDER BY pr.IDPaymentProof DESC) AS proof
  ORDER BY pg.Position;
END;
GO
