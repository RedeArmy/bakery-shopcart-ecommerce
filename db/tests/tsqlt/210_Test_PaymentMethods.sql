/* =====================================================================
   Objeto   : Test_PaymentMethods (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Mantenimiento de métodos de pago, efectivo solo en recogida y confirmación del cobro en sucursal
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
-- cspell:disable
EXEC tSQLt.NewTestClass 'Test_PaymentMethods';
GO

CREATE PROCEDURE Test_PaymentMethods.SetUp
AS
BEGIN
    EXEC Test_Orders.SetUp;
END;
GO

-- Mantenimiento ------------------------------------------------------------------------------

CREATE PROCEDURE Test_PaymentMethods.[test an administrator creates a deposit method that applies to both ways of receiving]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDMethod TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'  Transferencia ACH  ', @Description = N'Con su banca en línea',
         @IDPaymentMethod = @IDMethod OUTPUT;

    DECLARE @Title NVARCHAR(80) = (SELECT Title FROM dbo.PaymentMethods WHERE IDPaymentMethod = @IDMethod);
    DECLARE @Both INT = (SELECT COUNT(*) FROM dbo.PaymentMethods WHERE IDPaymentMethod = @IDMethod AND AppliesToDelivery = 1 AND AppliesToPickup = 1 AND IsActive = 1);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'PaymentMethods' AND Action = N'Create' AND EntityKey = CAST(@IDMethod AS NVARCHAR(40)));

    EXEC tSQLt.AssertEqualsString @Expected = N'Transferencia ACH', @Actual = @Title;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Both;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test cash is always kept for pickups only whatever is sent]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDMethod TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Cash', @Title = N'Efectivo en caja', @AppliesToDelivery = 1, @AppliesToPickup = 1,
         @IDPaymentMethod = @IDMethod OUTPUT;

    DECLARE @PickupOnly INT = (SELECT COUNT(*) FROM dbo.PaymentMethods WHERE IDPaymentMethod = @IDMethod AND AppliesToDelivery = 0 AND AppliesToPickup = 1);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PickupOnly;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test the constraint refuses a cash method that applies to deliveries]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_PaymentMethods_CashPickupOnly%';
    UPDATE dbo.PaymentMethods SET AppliesToDelivery = 1 WHERE Kind = N'Cash';
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test a customer cannot manage the payment methods]
AS
BEGIN
    DECLARE @Customer INT = Test_Shop.UserId(N'ana@shopcart.test'), @IDMethod TINYINT;
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Customer, @Kind = N'Deposit', @Title = N'Otro', @IDPaymentMethod = @IDMethod OUTPUT;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test two active methods cannot share a title]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @First TINYINT, @Second TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'Transferencia', @IDPaymentMethod = @First OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'Transferencia', @IDPaymentMethod = @Second OUTPUT;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test the card is not managed here]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE IDPaymentMethod = 1)
        INSERT INTO dbo.PaymentMethods (IDPaymentMethod, Code, Name, Kind) VALUES (1, N'CARD', N'Card', N'Card');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%PAYMENT_METHOD_NOT_MANAGED%';
    EXEC dbo.SP_PaymentMethods_Deactivate @IDActor = @Admin, @IDPaymentMethod = 1;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test deactivating hides the method from the customer list and is idempotent]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDMethod TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'Temporal', @IDPaymentMethod = @IDMethod OUTPUT;

    EXEC dbo.SP_PaymentMethods_Deactivate @IDActor = @Admin, @IDPaymentMethod = @IDMethod;
    EXEC dbo.SP_PaymentMethods_Deactivate @IDActor = @Admin, @IDPaymentMethod = @IDMethod;

    CREATE TABLE #Listed (IDPaymentMethod TINYINT, Code NVARCHAR(30), Kind NVARCHAR(10), Title NVARCHAR(80), Description NVARCHAR(300), AppliesToDelivery BIT, AppliesToPickup BIT, IsActive BIT);
    INSERT INTO #Listed EXEC dbo.SP_PaymentMethods_List;
    DECLARE @Visible INT = (SELECT COUNT(*) FROM #Listed WHERE IDPaymentMethod = @IDMethod);
    DELETE FROM #Listed;
    INSERT INTO #Listed EXEC dbo.SP_PaymentMethods_List @IncludeInactive = 1;
    DECLARE @Managed INT = (SELECT COUNT(*) FROM #Listed WHERE IDPaymentMethod = @IDMethod AND IsActive = 0);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'PaymentMethods' AND Action = N'Deactivate' AND EntityKey = CAST(@IDMethod AS NVARCHAR(40)));

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Visible;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Managed;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test the list for a delivery leaves out the cash methods]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Cash TINYINT, @Deposit TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Cash', @Title = N'Efectivo', @IDPaymentMethod = @Cash OUTPUT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'Depósito', @IDPaymentMethod = @Deposit OUTPUT;

    CREATE TABLE #Listed (IDPaymentMethod TINYINT, Code NVARCHAR(30), Kind NVARCHAR(10), Title NVARCHAR(80), Description NVARCHAR(300), AppliesToDelivery BIT, AppliesToPickup BIT, IsActive BIT);
    INSERT INTO #Listed EXEC dbo.SP_PaymentMethods_List @Fulfilment = N'Delivery';
    DECLARE @CashForDelivery INT = (SELECT COUNT(*) FROM #Listed WHERE IDPaymentMethod = @Cash);
    DECLARE @DepositForDelivery INT = (SELECT COUNT(*) FROM #Listed WHERE IDPaymentMethod = @Deposit);
    DELETE FROM #Listed;
    INSERT INTO #Listed EXEC dbo.SP_PaymentMethods_List @Fulfilment = N'Pickup';
    DECLARE @CashForPickup INT = (SELECT COUNT(*) FROM #Listed WHERE IDPaymentMethod = @Cash);

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @CashForDelivery;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @DepositForDelivery;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @CashForPickup;
END;
GO

-- Pedidos --------------------------------------------------------------------------------------

CREATE PROCEDURE Test_PaymentMethods.[test a delivery cannot be paid with cash]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3), @IDAddress INT;
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Cash TINYINT;
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Cash', @Title = N'Efectivo', @IDPaymentMethod = @Cash OUTPUT;
    EXEC dbo.SP_Addresses_Save @IDUser = @User, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000', @Line1 = N'5th Avenue 10-20',
         @Municipality = N'Guatemala', @Department = N'Guatemala', @IDSavedAddress = @IDAddress OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%PAYMENT_METHOD_UNAVAILABLE%';
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @IDAddress = @IDAddress, @IDPaymentMethod = @Cash,
         @IdempotencyKey = N'key-cash-1', @Now = '2030-06-01T12:05:00', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT,
         @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test a deactivated method cannot be used for an order]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Cash TINYINT;
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Cash', @Title = N'Efectivo', @IDPaymentMethod = @Cash OUTPUT;
    EXEC dbo.SP_PaymentMethods_Deactivate @IDActor = @Admin, @IDPaymentMethod = @Cash;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%PAYMENT_METHOD_UNAVAILABLE%';
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = @Cash, @IdempotencyKey = N'key-cash-2', @Now = '2030-06-01T12:05:00', @IDOrder = @IDOrder OUTPUT,
         @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test a pickup paid in cash has a pending payment with no deposit that lasts until the end of the estimated day]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Cash TINYINT;
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Cash', @Title = N'Efectivo', @IDPaymentMethod = @Cash OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = @Cash, @IdempotencyKey = N'key-cash-3', @Now = '2030-06-01T12:05:00', @IDOrder = @IDOrder OUTPUT,
         @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Pending INT = (SELECT COUNT(*) FROM dbo.Payments WHERE IDPayment = @IDPayment AND IDPaymentStatus = 1 AND IDPaymentMethod = @Cash);
    DECLARE @Deposits INT = (SELECT COUNT(*) FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    -- El día estimado es el 2 de junio: vence cuando termina en Guatemala (UTC-6), es decir el 3 de junio a las 06:00 UTC
    DECLARE @Ends NVARCHAR(30) = CONVERT(NVARCHAR(30), @Expires, 126);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Pending;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Deposits;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-03T06:00:00', @Actual = @Ends;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test a deposit needs no bank account any more]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-dep-1', @Now = '2030-06-01T12:05:00', @IDOrder = @IDOrder OUTPUT,
         @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @NoAccount INT = (SELECT COUNT(*) FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment AND IDBankAccount IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @NoAccount;
END;
GO

-- Cobro en sucursal ----------------------------------------------------------------------------

CREATE PROCEDURE Test_PaymentMethods.NewCashOrder @IDUser INT OUTPUT, @IDOrder INT OUTPUT, @IDPayment INT OUTPUT
AS
BEGIN
    DECLARE @IDReservation INT, @Branch INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Cash TINYINT;
    EXEC Test_PickupOrders.NewReservation @IDUser = @IDUser OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Cash', @Title = N'Efectivo', @IDPaymentMethod = @Cash OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @IDUser, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = @Cash, @IdempotencyKey = N'key-cash-9', @Now = '2030-06-01T12:05:00', @IDOrder = @IDOrder OUTPUT,
         @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test an operator confirms the cash and the order is paid, and confirming again changes nothing]
AS
BEGIN
    DECLARE @User INT, @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30), @Again VARCHAR(30);
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_PaymentMethods.NewCashOrder @IDUser = @User OUTPUT, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC dbo.SP_Payments_ConfirmCash @IDActor = @Admin, @IDPayment = @IDPayment, @Now = '2030-06-02T15:00:00', @Outcome = @Outcome OUTPUT;
    EXEC dbo.SP_Payments_ConfirmCash @IDActor = @Admin, @IDPayment = @IDPayment, @Now = '2030-06-02T15:01:00', @Outcome = @Again OUTPUT;

    DECLARE @PaymentApproved INT = (SELECT COUNT(*) FROM dbo.Payments WHERE IDPayment = @IDPayment AND IDPaymentStatus = 3);
    DECLARE @OrderPaid INT = (SELECT COUNT(*) FROM dbo.Orders WHERE IDOrder = @IDOrder AND IDOrderStatus = 2);

    EXEC tSQLt.AssertEqualsString @Expected = 'Approved', @Actual = @Outcome;
    EXEC tSQLt.AssertEqualsString @Expected = 'AlreadyApproved', @Actual = @Again;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PaymentApproved;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OrderPaid;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test a customer cannot confirm a cash payment]
AS
BEGIN
    DECLARE @User INT, @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(30);
    EXEC Test_PaymentMethods.NewCashOrder @IDUser = @User OUTPUT, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Payments_ConfirmCash @IDActor = @User, @IDPayment = @IDPayment, @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test a deposit payment is not a cash payment]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3), @Outcome VARCHAR(30);
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-dep-2', @Now = '2030-06-01T12:05:00', @IDOrder = @IDOrder OUTPUT,
         @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Payments_ConfirmCash @IDActor = @Admin, @IDPayment = @IDPayment, @Outcome = @Outcome OUTPUT;
END;
GO

-- Edición --------------------------------------------------------------------------------------

CREATE PROCEDURE Test_PaymentMethods.[test an administrator edits a method and the previous value is audited]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDMethod TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'Transferencia', @IDPaymentMethod = @IDMethod OUTPUT;

    EXEC dbo.SP_PaymentMethods_Update @IDActor = @Admin, @IDPaymentMethod = @IDMethod, @Title = N'  Transferencia ACH  ',
         @Description = N'Con su banca en línea', @AppliesToDelivery = 0, @AppliesToPickup = 1;

    DECLARE @Title NVARCHAR(80) = (SELECT Title FROM dbo.PaymentMethods WHERE IDPaymentMethod = @IDMethod);
    DECLARE @PickupOnly INT = (SELECT COUNT(*) FROM dbo.PaymentMethods WHERE IDPaymentMethod = @IDMethod AND AppliesToDelivery = 0 AND AppliesToPickup = 1);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'PaymentMethods' AND Action = N'Update' AND EntityKey = CAST(@IDMethod AS NVARCHAR(40)) AND PreviousValue IS NOT NULL);

    EXEC tSQLt.AssertEqualsString @Expected = N'Transferencia ACH', @Actual = @Title;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PickupOnly;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test editing a deactivated method with is active set reactivates it]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDMethod TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'Temporal', @IDPaymentMethod = @IDMethod OUTPUT;
    EXEC dbo.SP_PaymentMethods_Deactivate @IDActor = @Admin, @IDPaymentMethod = @IDMethod;

    EXEC dbo.SP_PaymentMethods_Update @IDActor = @Admin, @IDPaymentMethod = @IDMethod, @Title = N'Temporal', @IsActive = 1;

    DECLARE @Active INT = (SELECT COUNT(*) FROM dbo.PaymentMethods WHERE IDPaymentMethod = @IDMethod AND IsActive = 1);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Active;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test editing a cash method keeps it for pickups only]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDMethod TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Cash', @Title = N'Efectivo', @IDPaymentMethod = @IDMethod OUTPUT;

    EXEC dbo.SP_PaymentMethods_Update @IDActor = @Admin, @IDPaymentMethod = @IDMethod, @Title = N'Efectivo', @AppliesToDelivery = 1, @AppliesToPickup = 1;

    DECLARE @PickupOnly INT = (SELECT COUNT(*) FROM dbo.PaymentMethods WHERE IDPaymentMethod = @IDMethod AND AppliesToDelivery = 0 AND AppliesToPickup = 1);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PickupOnly;
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test editing cannot take a title another active method has]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @First TINYINT, @Second TINYINT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'Uno', @IDPaymentMethod = @First OUTPUT;
    EXEC dbo.SP_PaymentMethods_Create @IDActor = @Admin, @Kind = N'Deposit', @Title = N'Dos', @IDPaymentMethod = @Second OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_PaymentMethods_Update @IDActor = @Admin, @IDPaymentMethod = @Second, @Title = N'Uno';
END;
GO

CREATE PROCEDURE Test_PaymentMethods.[test a customer cannot edit a method and the card cannot be edited]
AS
BEGIN
    DECLARE @Customer INT = Test_Shop.UserId(N'ana@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @Denied INT = 0, @CardRefused INT = 0;
    BEGIN TRY
        EXEC dbo.SP_PaymentMethods_Update @IDActor = @Customer, @IDPaymentMethod = 2, @Title = N'Otro';
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 50422 SET @Denied = 1;
    END CATCH;

    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE IDPaymentMethod = 1)
        INSERT INTO dbo.PaymentMethods (IDPaymentMethod, Code, Name, Kind) VALUES (1, N'CARD', N'Card', N'Card');
    BEGIN TRY
        EXEC dbo.SP_PaymentMethods_Update @IDActor = @Admin, @IDPaymentMethod = 1, @Title = N'Otro';
    END TRY
    BEGIN CATCH
        IF ERROR_MESSAGE() LIKE N'%PAYMENT_METHOD_NOT_MANAGED%' SET @CardRefused = 1;
    END CATCH;

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Denied;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @CardRefused;
END;
GO
