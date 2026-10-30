/* =====================================================================
   Objeto   : Test_Payments (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Pago por depósito: comprobante, aprobación, rechazo, confirmación idempotente, pago tardío y expiración
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). Las confirmaciones simultáneas las cubre
              npm run sql:concurrency.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Payments';
GO

-- Todo lo de los pedidos más un operador, los estados y las transiciones que usa el flujo de pago. Los valores de referencia se
-- insertan solo si faltan, por si la prueba corre sin semillas.
CREATE PROCEDURE Test_Payments.SetUp
AS
BEGIN
    EXEC Test_Orders.SetUp;

    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 2) INSERT INTO dbo.Roles (IDRole, Name) VALUES (2, N'Operator');
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (2, N'operator@shopcart.test', N'not-a-real-hash', N'Test Operator');

    DECLARE @Index TINYINT = 1;
    WHILE @Index <= 8
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM dbo.OrderStatuses WHERE IDOrderStatus = @Index) INSERT INTO dbo.OrderStatuses VALUES (@Index, CONCAT(N'OrderStatus', @Index));
        IF NOT EXISTS (SELECT 1 FROM dbo.PaymentStatuses WHERE IDPaymentStatus = @Index) INSERT INTO dbo.PaymentStatuses VALUES (@Index, CONCAT(N'PaymentStatus', @Index));
        SET @Index += 1;
    END;
    IF NOT EXISTS (SELECT 1 FROM dbo.InventoryMovementTypes WHERE IDInventoryMovementType = 2) INSERT INTO dbo.InventoryMovementTypes VALUES (2, N'Exit');

    -- Las transiciones válidas son datos que cargan las semillas; aquí se aseguran las que usa el flujo
    INSERT INTO dbo.OrderStatusTransitions (IDFromStatus, IDToStatus)
    SELECT t.F, t.T FROM (VALUES (1, 2), (1, 6)) AS t (F, T)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderStatusTransitions x WHERE x.IDFromStatus = t.F AND x.IDToStatus = t.T);
    INSERT INTO dbo.PaymentStatusTransitions (IDFromStatus, IDToStatus)
    SELECT t.F, t.T FROM (VALUES (1, 2), (1, 3), (1, 5), (1, 6), (1, 8), (2, 3), (2, 4), (2, 8)) AS t (F, T)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.PaymentStatusTransitions x WHERE x.IDFromStatus = t.F AND x.IDToStatus = t.T);
END;
GO

-- Ayudas ------------------------------------------------------------------------------------

-- Crea un pedido del carrito de ejemplo (A + B + C = 245.45) con tarjeta (1) o depósito (2)
CREATE PROCEDURE Test_Payments.PlaceOrder
    @Email NVARCHAR(256), @Method TINYINT, @Key NVARCHAR(64), @IDOrder INT OUTPUT, @IDPayment INT OUTPUT
AS
BEGIN
    DECLARE @IDUser INT = Test_Shop.UserId(@Email), @Address INT = Test_Orders.AddressId(@Email);
    DECLARE @Bank INT = CASE WHEN @Method = 2 THEN Test_Orders.BankId(N'Test Bank') END;
    DECLARE @IDReservation INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = @Email;
    EXEC Test_Orders.Reserve @Email = @Email, @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @IDUser, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-20',
         @IDPaymentMethod = @Method, @IdempotencyKey = @Key, @IDBankAccount = @Bank, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.Proof
    @Email NVARCHAR(256), @IDPayment INT, @Hash CHAR(64), @Reference NVARCHAR(40), @Amount DECIMAL(18,2) = 245.45,
    @Now DATETIME2(3) = '2030-06-01T12:10:00'
AS
BEGIN
    DECLARE @IDUser INT = Test_Shop.UserId(@Email), @Storage NVARCHAR(100) = CONVERT(NVARCHAR(36), NEWID()), @IDProof INT;
    EXEC dbo.SP_Payments_RegisterProof @IDUser = @IDUser, @IDPayment = @IDPayment, @OriginalFileName = N'receipt.png', @StorageKey = @Storage,
         @MimeType = N'image/png', @SizeBytes = 2048, @Sha256Hash = @Hash, @ReferenceNumber = @Reference, @DepositDate = '2030-06-01',
         @DepositedAmount = @Amount, @Now = @Now, @IDPaymentProof = @IDProof OUTPUT;
END;
GO

-- Confirmación ------------------------------------------------------------------------------

CREATE PROCEDURE Test_Payments.[test confirming a payment pays the order and gives the stock an exit with the resulting balance]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Operator', @IDUser = @Operator,
         @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @PaidAt VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), PaidAt, 121) FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @OnHandA INT = (SELECT OnHandStock FROM dbo.Variants WHERE SKU = N'A-CAKE');
    DECLARE @ReservedA INT = (SELECT ReservedStock FROM dbo.Variants WHERE SKU = N'A-CAKE');
    DECLARE @Exits INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDInventoryMovementType = 2 AND Quantity = -1 AND ResultingBalance = 9);
    DECLARE @Reservation NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDOrder = @IDOrder);
    DECLARE @Charge DECIMAL(18,2) = (SELECT Amount FROM dbo.FinancialMovements WHERE IDPayment = @IDPayment AND Type = N'Charge');
    DECLARE @Movements INT = (SELECT COUNT(*) FROM dbo.FinancialMovements WHERE IDOrder = @IDOrder);

    EXEC tSQLt.AssertEqualsString @Expected = 'Approved', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-01 13:00:00.000', @Actual = @PaidAt;
    EXEC tSQLt.AssertEquals @Expected = 9, @Actual = @OnHandA;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ReservedA;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Exits;   -- una salida por línea: A, B y C
    EXEC tSQLt.AssertEqualsString @Expected = N'Consumed', @Actual = @Reservation;
    EXEC tSQLt.AssertEquals @Expected = 245.45, @Actual = @Charge;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Movements;
END;
GO

CREATE PROCEDURE Test_Payments.[test confirming leaves both histories and an audit entry]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Operator', @IDUser = @Operator, @Outcome = @Outcome OUTPUT;

    DECLARE @PaymentHistory INT = (SELECT COUNT(*) FROM dbo.PaymentStatusHistory WHERE IDPayment = @IDPayment AND IDNewStatus = 3 AND Source = N'Operator');
    DECLARE @OrderHistory INT = (SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE IDOrder = @IDOrder AND IDPreviousStatus = 1 AND IDNewStatus = 2);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Payments' AND Action = N'StatusChange' AND EntityKey = CAST(@IDPayment AS NVARCHAR(40)));
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PaymentHistory;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OrderHistory;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Payments.[test the provider fee is booked as a negative movement of the ledger]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @ProviderFee = 3.00, @Outcome = @Outcome OUTPUT;

    DECLARE @Fee DECIMAL(18,2) = (SELECT Amount FROM dbo.FinancialMovements WHERE IDPayment = @IDPayment AND Type = N'Fee');
    DECLARE @Stored DECIMAL(18,2) = (SELECT ProviderFee FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @Net DECIMAL(18,2) = (SELECT SUM(Amount) FROM dbo.FinancialMovements WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = -3.00, @Actual = @Fee;
    EXEC tSQLt.AssertEquals @Expected = 3.00, @Actual = @Stored;
    EXEC tSQLt.AssertEquals @Expected = 242.45, @Actual = @Net;
END;
GO

-- Un webhook repetido o una aprobación repetida no descuenta el stock ni cobra dos veces
CREATE PROCEDURE Test_Payments.[test confirming twice does nothing the second time]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @First VARCHAR(20), @Second VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @Outcome = @First OUTPUT;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @Outcome = @Second OUTPUT;

    DECLARE @OnHandA INT = (SELECT OnHandStock FROM dbo.Variants WHERE SKU = N'A-CAKE');
    DECLARE @Exits INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder);
    DECLARE @Charges INT = (SELECT COUNT(*) FROM dbo.FinancialMovements WHERE IDPayment = @IDPayment AND Type = N'Charge');
    EXEC tSQLt.AssertEqualsString @Expected = 'Approved', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = 'AlreadyApproved', @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 9, @Actual = @OnHandA;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Exits;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Charges;
END;
GO

-- Sin usuario (un webhook, un job) el movimiento de inventario se atribuye al cliente del pedido
CREATE PROCEDURE Test_Payments.[test a confirmation without a user attributes the stock exit to the customer]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @Outcome = @Outcome OUTPUT;

    DECLARE @Attributed INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDUser = @Ana);
    DECLARE @LedgerUser INT = (SELECT COUNT(*) FROM dbo.FinancialMovements WHERE IDPayment = @IDPayment AND IDUser IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Attributed;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @LedgerUser;
END;
GO

CREATE PROCEDURE Test_Payments.[test the money ledger of a coupon order is the discounted total]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20), @IDReservation INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    DECLARE @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-20',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 220.91, @Source = N'Webhook', @Outcome = @Outcome OUTPUT;

    DECLARE @Charge DECIMAL(18,2) = (SELECT Amount FROM dbo.FinancialMovements WHERE IDPayment = @IDPayment AND Type = N'Charge');
    EXEC tSQLt.AssertEquals @Expected = 220.91, @Actual = @Charge;
END;
GO

CREATE PROCEDURE Test_Payments.[test an amount that differs from the order total is never approved]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'AMOUNT_MISMATCH:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.44, @Source = N'Webhook', @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test confirming an unknown payment answers not found]
AS
BEGIN
    DECLARE @Outcome VARCHAR(20);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Payment not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = -1, @ReceivedAmount = 10.00, @Source = N'Webhook', @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test a source that is not allowed is rejected]
AS
BEGIN
    DECLARE @Outcome VARCHAR(20);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%valid Source%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = 1, @ReceivedAmount = 10.00, @Source = N'Somebody', @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test a payment that already failed cannot be approved]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    UPDATE dbo.Payments SET IDPaymentStatus = 5 WHERE IDPayment = @IDPayment;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%not in a state that allows%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @Outcome = @Outcome OUTPUT;
END;
GO

-- La reserva ya se devolvió al stock: descontarla otra vez dejaría los contadores mal
CREATE PROCEDURE Test_Payments.[test a payment whose reservation is no longer active is refused]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    UPDATE dbo.Reservations SET Status = N'Released' WHERE IDOrder = @IDOrder;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%reservation of the order is no longer active%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @Outcome = @Outcome OUTPUT;
END;
GO

-- Pago tardío ---------------------------------------------------------------------------------

-- El dinero llegó cuando el pedido ya estaba cancelado: no se resucita el pedido, se registra un reembolso pendiente
CREATE PROCEDURE Test_Payments.[test a late payment on a cancelled order books a pending refund and leaves the order alone]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_CancelPending @IDOrder = @IDOrder, @OpenPaymentStatus = 6, @Reason = N'Window elapsed', @Source = N'Job', @Now = '2030-06-01T12:30:00';

    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @Now = '2030-06-01T12:40:00', @Outcome = @Outcome OUTPUT;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @Now = '2030-06-01T12:41:00', @Outcome = @Outcome OUTPUT;

    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @Refunds INT = (SELECT COUNT(*) FROM dbo.Refunds WHERE IDPayment = @IDPayment AND Status = N'Pending' AND Amount = 245.45);
    DECLARE @AllRefunds INT = (SELECT COUNT(*) FROM dbo.Refunds WHERE IDPayment = @IDPayment);
    DECLARE @Exits INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEqualsString @Expected = 'Orphan', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Refunds;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @AllRefunds;   -- el aviso repetido no abre un segundo reembolso
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Exits;
END;
GO

CREATE PROCEDURE Test_Payments.[test registering an orphan payment needs a known payment and an amount]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Payment not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Payments_RegisterOrphanPayment @IDPayment = -1, @ReceivedAmount = 10.00;
END;
GO

-- Comprobante ---------------------------------------------------------------------------------

CREATE PROCEDURE Test_Payments.[test registering a proof stores it completes the deposit and sends the payment to review]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @IDProof INT, @Storage NVARCHAR(100) = CONVERT(NVARCHAR(36), NEWID());
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC dbo.SP_Payments_RegisterProof @IDUser = @Ana, @IDPayment = @IDPayment, @OriginalFileName = N'receipt.png', @StorageKey = @Storage,
         @MimeType = N'image/png', @SizeBytes = 2048, @Sha256Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @ReferenceNumber = N' 998877 ', @DepositDate = '2030-06-01', @DepositedAmount = 245.45, @Now = '2030-06-01T12:10:00', @IDPaymentProof = @IDProof OUTPUT;

    DECLARE @Status INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @Reference NVARCHAR(40) = (SELECT ReferenceNumber FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    DECLARE @Deposited DECIMAL(18,2) = (SELECT DepositedAmount FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    DECLARE @Proofs INT = (SELECT COUNT(*) FROM dbo.PaymentProofs WHERE IDPaymentProof = @IDProof AND IDUser = @Ana);
    DECLARE @History INT = (SELECT COUNT(*) FROM dbo.PaymentStatusHistory WHERE IDPayment = @IDPayment AND IDPreviousStatus = 1 AND IDNewStatus = 2);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Status;
    EXEC tSQLt.AssertEqualsString @Expected = N'998877', @Actual = @Reference;
    EXEC tSQLt.AssertEquals @Expected = 245.45, @Actual = @Deposited;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Proofs;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @History;
END;
GO

-- Anti-IDOR: el pago de otra persona responde igual que uno inexistente
CREATE PROCEDURE Test_Payments.[test another customer's payment answers not found for a proof]
AS
BEGIN
    DECLARE @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @IDProof INT, @Storage NVARCHAR(100) = CONVERT(NVARCHAR(36), NEWID());
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Payment not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Payments_RegisterProof @IDUser = @Luis, @IDPayment = @IDPayment, @OriginalFileName = N'receipt.png', @StorageKey = @Storage,
         @MimeType = N'image/png', @SizeBytes = 2048, @Sha256Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @ReferenceNumber = N'998877', @DepositDate = '2030-06-01', @DepositedAmount = 245.45, @IDPaymentProof = @IDProof OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test a card payment takes no proof]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @IDProof INT, @Storage NVARCHAR(100) = CONVERT(NVARCHAR(36), NEWID());
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%bank deposit only%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_RegisterProof @IDUser = @Ana, @IDPayment = @IDPayment, @OriginalFileName = N'receipt.png', @StorageKey = @Storage,
         @MimeType = N'image/png', @SizeBytes = 2048, @Sha256Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @ReferenceNumber = N'998877', @DepositDate = '2030-06-01', @DepositedAmount = 245.45, @IDPaymentProof = @IDProof OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test a second proof for a payment already under review is refused]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @IDProof INT, @Storage NVARCHAR(100) = CONVERT(NVARCHAR(36), NEWID());
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'111';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%only be registered for a pending deposit%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_RegisterProof @IDUser = @Ana, @IDPayment = @IDPayment, @OriginalFileName = N'receipt2.png', @StorageKey = @Storage,
         @MimeType = N'image/png', @SizeBytes = 2048, @Sha256Hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
         @ReferenceNumber = N'222', @DepositDate = '2030-06-01', @DepositedAmount = 245.45, @IDPaymentProof = @IDProof OUTPUT;
END;
GO

-- La misma boleta del mismo banco no respalda dos pagos vigentes
CREATE PROCEDURE Test_Payments.[test a bank reference already backing another payment is refused]
AS
BEGIN
    DECLARE @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @OrderA INT, @PaymentA INT, @OrderB INT, @PaymentB INT, @IDProof INT, @Storage NVARCHAR(100) = CONVERT(NVARCHAR(36), NEWID());
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @OrderA OUTPUT, @IDPayment = @PaymentA OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @PaymentA, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC Test_Payments.PlaceOrder @Email = N'luis@shopcart.test', @Method = 2, @Key = N'key-2', @IDOrder = @OrderB OUTPUT, @IDPayment = @PaymentB OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'REFERENCE_ALREADY_USED:%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Payments_RegisterProof @IDUser = @Luis, @IDPayment = @PaymentB, @OriginalFileName = N'other.png', @StorageKey = @Storage,
         @MimeType = N'image/png', @SizeBytes = 2048, @Sha256Hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
         @ReferenceNumber = N'555', @DepositDate = '2030-06-01', @DepositedAmount = 245.45, @IDPaymentProof = @IDProof OUTPUT;
END;
GO

-- Un mismo archivo no puede respaldar dos depósitos en revisión
CREATE PROCEDURE Test_Payments.[test a file already backing a payment under review is refused]
AS
BEGIN
    DECLARE @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @OrderA INT, @PaymentA INT, @OrderB INT, @PaymentB INT, @IDProof INT, @Storage NVARCHAR(100) = CONVERT(NVARCHAR(36), NEWID());
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @OrderA OUTPUT, @IDPayment = @PaymentA OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @PaymentA, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC Test_Payments.PlaceOrder @Email = N'luis@shopcart.test', @Method = 2, @Key = N'key-2', @IDOrder = @OrderB OUTPUT, @IDPayment = @PaymentB OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'PAYMENT_PROOF_REUSED:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_RegisterProof @IDUser = @Luis, @IDPayment = @PaymentB, @OriginalFileName = N'same.png', @StorageKey = @Storage,
         @MimeType = N'image/png', @SizeBytes = 2048, @Sha256Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @ReferenceNumber = N'666', @DepositDate = '2030-06-01', @DepositedAmount = 245.45, @IDPaymentProof = @IDProof OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test a proof with an unsupported file type or size is rejected]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @IDProof INT, @Storage NVARCHAR(100) = CONVERT(NVARCHAR(36), NEWID());
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%MimeType of JPEG, PNG or PDF%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Payments_RegisterProof @IDUser = @Ana, @IDPayment = @IDPayment, @OriginalFileName = N'virus.exe', @StorageKey = @Storage,
         @MimeType = N'application/x-msdownload', @SizeBytes = 2048, @Sha256Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @ReferenceNumber = N'777', @DepositDate = '2030-06-01', @DepositedAmount = 245.45, @IDPaymentProof = @IDProof OUTPUT;
END;
GO

-- Aprobar -------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Payments.[test an operator approves a deposit whose amount matches and the order is paid]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';

    EXEC dbo.SP_Payments_ApproveDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Reviewer INT = (SELECT IDReviewerUser FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    DECLARE @Source INT = (SELECT COUNT(*) FROM dbo.PaymentStatusHistory WHERE IDPayment = @IDPayment AND IDNewStatus = 3 AND Source = N'Operator' AND IDUser = @Operator);
    EXEC tSQLt.AssertEqualsString @Expected = 'Approved', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEquals @Expected = @Operator, @Actual = @Reviewer;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Source;
END;
GO

-- No hay aprobaciones parciales: un monto distinto se rechaza con motivo
CREATE PROCEDURE Test_Payments.[test a deposit with another amount is rejected instead of approved]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555', @Amount = 200.00;

    EXEC dbo.SP_Payments_ApproveDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Reason NVARCHAR(250) = (SELECT RejectionReason FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    EXEC tSQLt.AssertEqualsString @Expected = 'RejectedAmountMismatch', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'The deposited amount does not match the order total', @Actual = @Reason;
END;
GO

CREATE PROCEDURE Test_Payments.[test approving twice is a no-op for the second operator]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @First VARCHAR(30), @Second VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC dbo.SP_Payments_ApproveDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Outcome = @First OUTPUT;
    EXEC dbo.SP_Payments_ApproveDeposit @IDActor = @Admin, @IDPayment = @IDPayment, @Outcome = @Second OUTPUT;

    DECLARE @Exits INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEqualsString @Expected = 'Approved', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = 'AlreadyApproved', @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Exits;
END;
GO

CREATE PROCEDURE Test_Payments.[test a customer cannot approve a deposit]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%operator or administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_ApproveDeposit @IDActor = @Ana, @IDPayment = @IDPayment, @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test a deposit without a proof cannot be approved]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%no proof under review%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_ApproveDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test a rejected deposit cannot be approved afterwards]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N'Blurry photo', @Outcome = @Outcome OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%already rejected%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_ApproveDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Outcome = @Outcome OUTPUT;
END;
GO

-- Rechazar ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Payments.[test rejecting a deposit frees the reference keeps the order pending and extends the window]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-0', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    -- Un pedido con depósito cuyo plazo es corto: la reserva vence a las 12:20 y el rechazo, a las 13:00, la amplía hasta las 01:00
    UPDATE dbo.Payments SET IDPaymentMethod = 2 WHERE IDPayment = @IDPayment;
    INSERT INTO dbo.PaymentDeposits (IDPayment, IDBankAccount) VALUES (@IDPayment, Test_Orders.BankId(N'Test Bank'));
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';

    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N' Reference does not exist ', @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @IsCurrent INT = (SELECT CAST(IsCurrent AS INT) FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    DECLARE @Reason NVARCHAR(250) = (SELECT RejectionReason FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    DECLARE @Window VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), ExpiresAt, 121) FROM dbo.Reservations WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEqualsString @Expected = 'Rejected', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @IsCurrent;
    EXEC tSQLt.AssertEqualsString @Expected = N'Reference does not exist', @Actual = @Reason;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-02 01:00:00.000', @Actual = @Window;   -- 13:00 más 12 horas de gracia
END;
GO

CREATE PROCEDURE Test_Payments.[test a rejected reference can back a corrected payment]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @OrderA INT, @PaymentA INT, @OrderB INT, @PaymentB INT, @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @OrderA OUTPUT, @IDPayment = @PaymentA OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @PaymentA, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @PaymentA, @Reason = N'Wrong amount', @Outcome = @Outcome OUTPUT;
    EXEC Test_Payments.PlaceOrder @Email = N'luis@shopcart.test', @Method = 2, @Key = N'key-2', @IDOrder = @OrderB OUTPUT, @IDPayment = @PaymentB OUTPUT;

    EXEC Test_Payments.Proof @Email = N'luis@shopcart.test', @IDPayment = @PaymentB, @Hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @Reference = N'555';

    DECLARE @Status INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @PaymentB);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Status;
END;
GO

CREATE PROCEDURE Test_Payments.[test rejecting needs a reason]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @Outcome VARCHAR(30);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Reason%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = 1, @Reason = N'   ', @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test a customer cannot reject a deposit]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Outcome VARCHAR(30);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%operator or administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Ana, @IDPayment = 1, @Reason = N'Because', @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test only a deposit under review can be rejected]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%under review can be rejected%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N'No proof yet', @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Payments.[test rejecting twice is a no-op the second time]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @First VARCHAR(30), @Second VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N'Blurry', @Outcome = @First OUTPUT;
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N'Blurry', @Outcome = @Second OUTPUT;

    DECLARE @History INT = (SELECT COUNT(*) FROM dbo.PaymentStatusHistory WHERE IDPayment = @IDPayment AND IDNewStatus = 4);
    EXEC tSQLt.AssertEqualsString @Expected = 'Rejected', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = 'AlreadyRejected', @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @History;
END;
GO

-- Nuevo intento y límite de intentos ------------------------------------------------------------------

CREATE PROCEDURE Test_Payments.[test a new attempt after a rejection reuses the account and the remaining window]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Second INT, @Expires DATETIME2(3), @Outcome VARCHAR(30);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N'Wrong amount', @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;

    EXEC dbo.SP_Payments_CreateDepositAttempt @IDUser = @Ana, @IDOrder = @IDOrder, @IdempotencyKey = N'key-2', @Now = '2030-06-01T14:00:00',
         @IDPayment = @Second OUTPUT, @ExpiresAt = @Expires OUTPUT;

    DECLARE @Status INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @Second);
    DECLARE @Amount DECIMAL(18,2) = (SELECT Amount FROM dbo.Payments WHERE IDPayment = @Second);
    DECLARE @SameAccount INT = (SELECT COUNT(*) FROM dbo.PaymentDeposits a JOIN dbo.PaymentDeposits b ON b.IDBankAccount = a.IDBankAccount WHERE a.IDPayment = @IDPayment AND b.IDPayment = @Second);
    DECLARE @ExpiresText VARCHAR(23) = CONVERT(VARCHAR(23), @Expires, 121);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 245.45, @Actual = @Amount;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @SameAccount;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-02 12:05:00.000', @Actual = @ExpiresText;   -- la ventana de 24 horas del pedido, que la gracia no acortó
END;
GO

CREATE PROCEDURE Test_Payments.[test a new attempt is refused while another payment is open]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Second INT, @Expires DATETIME2(3);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%already has an open payment%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_CreateDepositAttempt @IDUser = @Ana, @IDOrder = @IDOrder, @IdempotencyKey = N'key-2', @IDPayment = @Second OUTPUT, @ExpiresAt = @Expires OUTPUT;
END;
GO

-- Anti-IDOR: el pedido de otra persona responde igual que uno inexistente
CREATE PROCEDURE Test_Payments.[test another customer's order answers not found for a new attempt]
AS
BEGIN
    DECLARE @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Second INT, @Expires DATETIME2(3);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Order not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Payments_CreateDepositAttempt @IDUser = @Luis, @IDOrder = @IDOrder, @IdempotencyKey = N'key-2', @IDPayment = @Second OUTPUT, @ExpiresAt = @Expires OUTPUT;
END;
GO

-- Tres rechazos agotan los intentos: el pedido se cancela y devuelve el stock, el cupón y la reserva
CREATE PROCEDURE Test_Payments.[test the third rejection cancels the order and returns the stock the reservation and the coupon]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Address INT = Test_Orders.AddressId(N'ana@shopcart.test'), @Bank INT = Test_Orders.BankId(N'Test Bank');
    DECLARE @IDOrder INT, @First INT, @Second INT, @Third INT, @Expires DATETIME2(3), @Outcome VARCHAR(30), @IDReservation INT, @Number NVARCHAR(20), @Expires2 DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-20',
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-1', @IDBankAccount = @Bank, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @First OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires2 OUTPUT;

    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @First, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'1', @Amount = 220.91;
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @First, @Reason = N'Attempt 1', @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;
    EXEC dbo.SP_Payments_CreateDepositAttempt @IDUser = @Ana, @IDOrder = @IDOrder, @IdempotencyKey = N'key-2', @Now = '2030-06-01T14:00:00', @IDPayment = @Second OUTPUT, @ExpiresAt = @Expires OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @Second, @Hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @Reference = N'2', @Amount = 220.91, @Now = '2030-06-01T14:10:00';
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @Second, @Reason = N'Attempt 2', @Now = '2030-06-01T15:00:00', @Outcome = @Outcome OUTPUT;
    EXEC dbo.SP_Payments_CreateDepositAttempt @IDUser = @Ana, @IDOrder = @IDOrder, @IdempotencyKey = N'key-3', @Now = '2030-06-01T16:00:00', @IDPayment = @Third OUTPUT, @ExpiresAt = @Expires OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @Third, @Hash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', @Reference = N'3', @Amount = 220.91, @Now = '2030-06-01T16:10:00';

    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @Third, @Reason = N'Attempt 3', @Now = '2030-06-01T17:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Reservation NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDReservation = @IDReservation);
    DECLARE @Reserved INT = (SELECT SUM(ReservedStock) FROM dbo.Variants WHERE SKU IN (N'A-CAKE', N'B-COOKIE', N'C-CUPCAKE'));
    DECLARE @CouponUses INT = (SELECT UsageCount FROM dbo.Coupons WHERE Code = N'WELCOME10');
    DECLARE @Voided INT = (SELECT COUNT(*) FROM dbo.CouponUsages WHERE IDOrder = @IDOrder AND IsVoided = 1);
    DECLARE @Movements INT = (SELECT COUNT(*) FROM dbo.InventoryMovements);
    EXEC tSQLt.AssertEqualsString @Expected = 'RejectedOrderCancelled', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'Released', @Actual = @Reservation;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Reserved;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @CouponUses;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Voided;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Movements;   -- nunca hubo salida física que revertir
END;
GO

-- Expiración ----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Payments.[test a pending payment past its deadline expires and cancels the order and returns what it held]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Expired INT;
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;   -- vence a las 12:20

    EXEC dbo.SP_Payments_ExpirePending @Now = '2030-06-01T12:30:00', @Expired = @Expired OUTPUT;

    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Reservation NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDOrder = @IDOrder);
    DECLARE @Reserved INT = (SELECT SUM(ReservedStock) FROM dbo.Variants);
    DECLARE @OrderHistory INT = (SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE IDOrder = @IDOrder AND IDNewStatus = 6 AND IDUser IS NULL);
    DECLARE @PaymentHistory INT = (SELECT COUNT(*) FROM dbo.PaymentStatusHistory WHERE IDPayment = @IDPayment AND IDNewStatus = 6 AND Source = N'Job');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Expired;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'Released', @Actual = @Reservation;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Reserved;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OrderHistory;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PaymentHistory;
END;
GO

CREATE PROCEDURE Test_Payments.[test a payment not yet due is left alone]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Expired INT;
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC dbo.SP_Payments_ExpirePending @Now = '2030-06-01T12:10:00', @Expired = @Expired OUTPUT;

    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Expired;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OrderStatus;
END;
GO

-- Un depósito en revisión lo resuelve un operador: por mucho que pase el tiempo, no vence
CREATE PROCEDURE Test_Payments.[test a payment under review never expires]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Expired INT;
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';

    EXEC dbo.SP_Payments_ExpirePending @Now = '2031-06-01T12:00:00', @Expired = @Expired OUTPUT;

    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Expired;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OrderStatus;
END;
GO

-- El depósito se rechazó y el cliente no volvió: sin pago abierto, cuando vence la reserva el pedido se cancela
CREATE PROCEDURE Test_Payments.[test an order with a rejected deposit and no new attempt is cancelled when its window elapses]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30), @Expired INT;
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 2, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Reference = N'555';
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N'Blurry', @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @TooEarly INT, @OnTime INT;
    EXEC dbo.SP_Payments_ExpirePending @Now = '2030-06-02T00:00:00', @Expired = @TooEarly OUTPUT;   -- la reserva llega hasta las 12:05 del día 2
    EXEC dbo.SP_Payments_ExpirePending @Now = '2030-06-02T13:00:00', @Expired = @OnTime OUTPUT;

    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Reserved INT = (SELECT SUM(ReservedStock) FROM dbo.Variants);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @TooEarly;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OnTime;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Reserved;
END;
GO

CREATE PROCEDURE Test_Payments.[test the expiry works in batches and a second run finds nothing left]
AS
BEGIN
    DECLARE @OrderA INT, @PaymentA INT, @OrderB INT, @PaymentB INT, @First INT, @Rest INT, @Again INT;
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @OrderA OUTPUT, @IDPayment = @PaymentA OUTPUT;
    EXEC Test_Payments.PlaceOrder @Email = N'luis@shopcart.test', @Method = 1, @Key = N'key-2', @IDOrder = @OrderB OUTPUT, @IDPayment = @PaymentB OUTPUT;

    EXEC dbo.SP_Payments_ExpirePending @Now = '2030-06-01T13:00:00', @BatchSize = 1, @Expired = @First OUTPUT;
    EXEC dbo.SP_Payments_ExpirePending @Now = '2030-06-01T13:00:00', @BatchSize = 10, @Expired = @Rest OUTPUT;
    EXEC dbo.SP_Payments_ExpirePending @Now = '2030-06-01T13:00:00', @Expired = @Again OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rest;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Again;
END;
GO

CREATE PROCEDURE Test_Payments.[test the expiry rejects an invalid batch size]
AS
BEGIN
    DECLARE @Expired INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%BatchSize%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Payments_ExpirePending @BatchSize = 0, @Expired = @Expired OUTPUT;
END;
GO

-- Cancelar un pedido pendiente -----------------------------------------------------------------------

CREATE PROCEDURE Test_Payments.[test cancelling a pending order twice is harmless]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_CancelPending @IDOrder = @IDOrder, @OpenPaymentStatus = 8, @Reason = N'Customer changed their mind', @Source = N'Customer', @Now = '2030-06-01T12:10:00';
    EXEC dbo.SP_Orders_CancelPending @IDOrder = @IDOrder, @OpenPaymentStatus = 8, @Reason = N'Customer changed their mind', @Source = N'Customer', @Now = '2030-06-01T12:11:00';

    DECLARE @History INT = (SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE IDOrder = @IDOrder AND IDNewStatus = 6);
    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @History;
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @PaymentStatus;
END;
GO

CREATE PROCEDURE Test_Payments.[test a paid order cannot be cancelled as pending]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(20);
    EXEC Test_Payments.PlaceOrder @Email = N'ana@shopcart.test', @Method = 1, @Key = N'key-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 245.45, @Source = N'Webhook', @Outcome = @Outcome OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%pending payment can be cancelled here%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_CancelPending @IDOrder = @IDOrder, @OpenPaymentStatus = 8, @Reason = N'Too late', @Source = N'Customer';
END;
GO

CREATE PROCEDURE Test_Payments.[test cancelling an unknown order answers not found]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Order not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_CancelPending @IDOrder = -1, @OpenPaymentStatus = 8, @Reason = N'Ghost', @Source = N'Customer';
END;
GO
