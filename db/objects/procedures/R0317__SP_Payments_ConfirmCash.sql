/* =====================================================================
   Objeto   : dbo.SP_Payments_ConfirmCash
   Version  : 1.0.0
   Cambio   : Primera versión: un operador confirma que se cobró en efectivo, en la sucursal, un pago pendiente de clase efectivo
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. Reutiliza SP_Payments_ConfirmPayment: marca el pedido como pagado y da salida al inventario. @Outcome: Approved,
              AlreadyApproved u Orphan. Errores: 50400, 50404 pago inexistente o que no es de efectivo, 50422 actor sin permiso o
              pago que ya no está pendiente.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_ConfirmCash
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
    THROW 50422, 'Only an active operator or administrator can confirm a cash payment.', 1;

  -- Entra por la clave primaria y sin join, como los demás procedimientos de revisión de pagos
  DECLARE @Status TINYINT, @Amount DECIMAL(18,2), @IDMethod TINYINT;
  SELECT @Status = IDPaymentStatus, @Amount = Amount, @IDMethod = IDPaymentMethod
  FROM dbo.Payments WITH (UPDLOCK, ROWLOCK, INDEX(PK_Payments))
  WHERE IDPayment = @IDPayment;

  IF @Status IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE IDPaymentMethod = @IDMethod AND Kind = N'Cash')
    THROW 50404, 'Payment not found.', 1;

  -- Dos operadores confirmando a la vez: el segundo recibe el no-op idempotente
  IF @Status = 3
  BEGIN
    SET @Outcome = 'AlreadyApproved';
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;
  IF @Status <> 1
    THROW 50422, 'The cash payment is no longer pending.', 1;

  EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = @Amount, @Source = N'Operator',
       @IDUser = @IDActor, @Now = @Now, @Outcome = @Outcome OUTPUT;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
