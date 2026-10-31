/* =====================================================================
   Objeto   : dbo.SP_Payments_ListPendingDeposits
   Version  : 1.1.0
   Cambio   : El total ya no se calcula con COUNT(*) OVER () (un Window Spool que escribía cada fila en tempdb); se cuenta aparte y solo se leen
              las filas de la página; sin RECOMPILE: la cola en revisión (la consulta frecuente de los operadores) pasaba de 25 a 70 ms por compilar 8 tablas
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Mismas columnas y mismo orden que 1.0.0. Por defecto lista los depósitos en revisión (estado 2), los más antiguos primero con su antigüedad en horas;
              con otro estado sirve de historial. Errores: 50400 paginación o rango inválidos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_ListPendingDeposits
  @IDPaymentStatus TINYINT      = 2,
  @From            DATETIME2(3) = NULL,
  @To              DATETIME2(3) = NULL,
  @Now             DATETIME2(3) = NULL,
  @PageNumber      INT          = 1,
  @PageSize        INT          = 20
AS
BEGIN
  SET NOCOUNT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;
  IF @From IS NOT NULL AND @To IS NOT NULL AND @From >= @To
    THROW 50400, 'From must be before To.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  -- Se ordena de lo más antiguo a lo más nuevo en revisión (primero en llegar, primero en atenderse) y al revés en el historial
  ;WITH f AS (
    SELECT p.IDPayment
    FROM dbo.Payments AS p
    WHERE p.IDPaymentMethod = 2 AND p.IDPaymentStatus = @IDPaymentStatus
      AND (@From IS NULL OR p.CreatedAt >= @From)
      AND (@To IS NULL OR p.CreatedAt < @To)
  ), pg AS (
    SELECT IDPayment FROM f
    ORDER BY CASE WHEN @IDPaymentStatus = 2 THEN IDPayment END ASC,
             CASE WHEN @IDPaymentStatus <> 2 THEN IDPayment END DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
  )
  SELECT p.IDPayment, p.IDOrder, o.OrderNumber, CustomerName = u.FullName, CustomerEmail = u.Email,
         Amount = CAST(p.Amount AS VARCHAR(25)), p.IDPaymentStatus, StatusName = s.Name,
         b.BankName, d.ReferenceNumber, d.DepositDate, DepositedAmount = CAST(d.DepositedAmount AS VARCHAR(25)),
         d.RejectionReason, proof.IDPaymentProof, SubmittedAt = proof.UploadedAt,
         AgeHours = DATEDIFF(HOUR, proof.UploadedAt, @Now),
         TotalCount = (SELECT COUNT(*) FROM f)
  FROM pg
  JOIN dbo.Payments AS p ON p.IDPayment = pg.IDPayment
  JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
  JOIN dbo.Users AS u ON u.IDUser = o.IDUser
  JOIN dbo.PaymentStatuses AS s ON s.IDPaymentStatus = p.IDPaymentStatus
  JOIN dbo.PaymentDeposits AS d ON d.IDPayment = p.IDPayment
  JOIN dbo.BankAccounts AS b ON b.IDBankAccount = d.IDBankAccount
  OUTER APPLY (SELECT TOP (1) pr.IDPaymentProof, pr.UploadedAt FROM dbo.PaymentProofs AS pr
               WHERE pr.IDPayment = p.IDPayment ORDER BY pr.IDPaymentProof DESC) AS proof
  ORDER BY CASE WHEN @IDPaymentStatus = 2 THEN p.IDPayment END ASC,
           CASE WHEN @IDPaymentStatus <> 2 THEN p.IDPayment END DESC;
END;
GO
