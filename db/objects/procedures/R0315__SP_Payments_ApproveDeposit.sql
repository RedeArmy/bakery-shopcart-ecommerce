/* =====================================================================
   Objeto   : dbo.SP_Payments_ApproveDeposit
   Version  : 1.0.0
   Cambio   : Primera versión: un operador aprueba un depósito en revisión si el monto depositado es exactamente el del pedido
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @Outcome: Approved, AlreadyApproved, Orphan (el pedido ya no estaba vigente) o RejectedAmountMismatch
              (el monto depositado no coincide: se rechaza con motivo, no hay aprobaciones parciales).
              Errores: 50400, 50404, 50422 actor sin permiso, depósito ya rechazado o sin comprobante.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_ApproveDeposit
  @IDActor   INT,
  @IDPayment INT,
  @Now       DATETIME2(3) = NULL,
  @Outcome   VARCHAR(30)  = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDPayment IS NULL
    THROW 50400, 'IDActor and IDPayment are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @Outcome = NULL;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDActor AND IDRole IN (2, 3) AND IsActive = 1)
    THROW 50422, 'Only an active operator or administrator can review deposits.', 1;

  -- El bloqueo del pago entra siempre por la clave primaria y sin join, igual que SP_Payments_RejectDeposit: con otro camino de acceso
  -- los dos procedimientos tomaban los índices de Payments en orden opuesto y se esperaban en círculo (deadlock de la prueba de concurrencia)
  DECLARE @Status TINYINT, @Amount DECIMAL(18,2), @Deposited DECIMAL(18,2);
  SELECT @Status = IDPaymentStatus, @Amount = Amount
  FROM dbo.Payments WITH (UPDLOCK, ROWLOCK, INDEX(PK_Payments))
  WHERE IDPayment = @IDPayment AND IDPaymentMethod = 2;

  IF @Status IS NULL
    THROW 50404, 'Payment not found.', 1;

  SELECT @Deposited = DepositedAmount FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment;

  -- Dos operadores aprobando a la vez: el segundo recibe el no-op idempotente
  IF @Status = 3
  BEGIN
    SET @Outcome = 'AlreadyApproved';
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;
  IF @Status = 4
    THROW 50422, 'The deposit was already rejected.', 1;
  IF @Status <> 2
    THROW 50422, 'The deposit has no proof under review.', 1;

  IF @Deposited IS NULL OR @Deposited <> @Amount
  BEGIN
    -- Aprobar un monto distinto sería una aprobación parcial: se rechaza con el motivo, para que el cliente sepa qué corregir
    DECLARE @RejectOutcome VARCHAR(30);
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @IDActor, @IDPayment = @IDPayment,
         @Reason = N'The deposited amount does not match the order total', @Now = @Now, @Outcome = @RejectOutcome OUTPUT;
    SET @Outcome = 'RejectedAmountMismatch';
  END
  ELSE
  BEGIN
    UPDATE dbo.PaymentDeposits SET IDReviewerUser = @IDActor, ReviewedAt = @Now WHERE IDPayment = @IDPayment;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = @Deposited, @Source = N'Operator',
         @IDUser = @IDActor, @Now = @Now, @Outcome = @Outcome OUTPUT;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
