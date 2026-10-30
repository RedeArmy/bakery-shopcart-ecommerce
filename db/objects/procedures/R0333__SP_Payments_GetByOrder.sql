/* =====================================================================
   Objeto   : dbo.SP_Payments_GetByOrder
   Version  : 1.0.0
   Cambio   : Primera versión: intentos de pago de un pedido con su depósito, comprobantes y motivo de rechazo
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un renglón por intento, el más reciente primero; Proofs es un arreglo JSON. Si el pedido no es de quien
              pregunta responde igual que si no existiera. Errores: 50400, 50404.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_GetByOrder
  @IDActor INT,
  @AsStaff BIT = 0,
  @IDOrder INT
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDActor IS NULL OR @IDOrder IS NULL
    THROW 50400, 'IDActor and IDOrder are required.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE IDOrder = @IDOrder AND (@AsStaff = 1 OR IDUser = @IDActor))
    THROW 50404, 'Order not found.', 1;

  DECLARE @MaxAttempts INT = ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'MaxDepositAttempts'), 3);
  -- IX_Payments_Order fuerza buscar solo los pagos de este pedido (ver SP_Orders_CancelPending)
  DECLARE @Rejected INT = (SELECT COUNT(*) FROM dbo.Payments WITH (INDEX(IX_Payments_Order)) WHERE IDOrder = @IDOrder AND IDPaymentStatus = 4);

  SELECT p.IDPayment, p.IDPaymentMethod, MethodCode = m.Code, p.IDPaymentStatus, StatusName = s.Name,
         Amount = CAST(p.Amount AS VARCHAR(25)), p.ExpiresAt, p.CreatedAt, p.ResolvedAt,
         d.IDBankAccount, b.BankName, b.AccountType, b.AccountNumber, b.HolderName, b.Instructions,
         d.ReferenceNumber, d.DepositDate, DepositedAmount = CAST(d.DepositedAmount AS VARCHAR(25)),
         d.IsCurrent, d.RejectionReason, d.ReviewedAt,
         AttemptsRejected = @Rejected, MaxAttempts = @MaxAttempts,
         Proofs = ISNULL((SELECT pr.IDPaymentProof, pr.OriginalFileName, pr.MimeType, pr.SizeBytes, pr.UploadedAt
                          FROM dbo.PaymentProofs AS pr WHERE pr.IDPayment = p.IDPayment
                          ORDER BY pr.IDPaymentProof FOR JSON PATH), N'[]')
  FROM dbo.Payments AS p WITH (INDEX(IX_Payments_Order))
  JOIN dbo.PaymentMethods AS m ON m.IDPaymentMethod = p.IDPaymentMethod
  JOIN dbo.PaymentStatuses AS s ON s.IDPaymentStatus = p.IDPaymentStatus
  LEFT JOIN dbo.PaymentDeposits AS d ON d.IDPayment = p.IDPayment
  LEFT JOIN dbo.BankAccounts AS b ON b.IDBankAccount = d.IDBankAccount
  WHERE p.IDOrder = @IDOrder
  ORDER BY p.IDPayment DESC;
END;
GO
