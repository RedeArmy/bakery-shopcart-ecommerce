/* =====================================================================
   Objeto   : dbo.SP_Payments_CreateDepositAttempt
   Version  : 1.0.0
   Cambio   : Primera versión: nuevo intento de depósito para un pedido cuyo depósito se rechazó (no figuraba en el catálogo)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un pago rechazado es terminal: reintentar crea otro pago para el mismo pedido. Errores: 50400,
              50404 pedido inexistente o ajeno, 50409 reserva vencida o llave repetida, 50422 el pedido no admite otro intento.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_CreateDepositAttempt
  @IDUser         INT,
  @IDOrder        INT,
  @IdempotencyKey NVARCHAR(64),
  -- Si no se indica, se usa la cuenta del intento anterior
  @IDBankAccount  INT          = NULL,
  @Now            DATETIME2(3) = NULL,
  @IDPayment      INT          = NULL OUTPUT,
  @ExpiresAt      DATETIME2(3) = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL OR @IDOrder IS NULL OR ISNULL(@IdempotencyKey, N'') = N''
    THROW 50400, 'IDUser, IDOrder and IdempotencyKey are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  DECLARE @OrderStatus TINYINT, @Total DECIMAL(18,2);
  SELECT @OrderStatus = IDOrderStatus, @Total = Total FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE IDOrder = @IDOrder AND IDUser = @IDUser;
  IF @OrderStatus IS NULL
    THROW 50404, 'Order not found.', 1;
  IF @OrderStatus <> 1
    THROW 50422, 'Only an order pending payment admits another deposit attempt.', 1;

  -- Un solo intento abierto por pedido: mientras haya uno pendiente o en revisión no se abre otro
  -- IX_Payments_Order fuerza buscar solo los pagos de este pedido: sin él el optimizador recorre el índice por estado y choca con las filas sin confirmar de otros pedidos (deadlock que mostró la prueba de concurrencia)
  IF EXISTS (SELECT 1 FROM dbo.Payments WITH (INDEX(IX_Payments_Order)) WHERE IDOrder = @IDOrder AND IDPaymentStatus IN (1, 2))
    THROW 50422, 'The order already has an open payment attempt.', 1;

  IF (SELECT COUNT(*) FROM dbo.Payments WITH (INDEX(IX_Payments_Order)) WHERE IDOrder = @IDOrder AND IDPaymentStatus = 4)
       >= ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'MaxDepositAttempts'), 3)
    THROW 50422, 'DEPOSIT_ATTEMPTS_EXCEEDED: The maximum number of deposit attempts was reached.', 1;

  IF @IDBankAccount IS NULL
    SET @IDBankAccount = (SELECT TOP (1) d.IDBankAccount FROM dbo.PaymentDeposits AS d JOIN dbo.Payments AS p ON p.IDPayment = d.IDPayment
                          WHERE p.IDOrder = @IDOrder ORDER BY p.IDPayment DESC);
  IF @IDBankAccount IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.BankAccounts WHERE IDBankAccount = @IDBankAccount AND IsActive = 1)
    THROW 50404, 'Bank account not found.', 1;

  -- El nuevo intento vive lo que le quede a la reserva, que el rechazo ya amplió (SP_Payments_RejectDeposit)
  SELECT @ExpiresAt = ExpiresAt FROM dbo.Reservations WHERE IDOrder = @IDOrder AND Status = N'Active';
  IF @ExpiresAt IS NULL OR @ExpiresAt <= @Now
    THROW 50409, 'RESERVATION_EXPIRED: The reservation of the order is no longer valid.', 1;

  BEGIN TRY
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt, CreatedAt)
    VALUES (@IDOrder, 2, 1, @Total, @IdempotencyKey, @ExpiresAt, @Now);
    SET @IDPayment = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'IDEMPOTENCY_KEY_IN_USE: The key was already used for another payment.', 1;
    THROW;
  END CATCH;

  INSERT INTO dbo.PaymentDeposits (IDPayment, IDBankAccount) VALUES (@IDPayment, @IDBankAccount);
  INSERT INTO dbo.PaymentStatusHistory (IDPayment, IDPreviousStatus, IDNewStatus, IDUser, Source, CreatedAt, Comment)
  VALUES (@IDPayment, NULL, 1, @IDUser, N'Customer', @Now, N'New deposit attempt');

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
