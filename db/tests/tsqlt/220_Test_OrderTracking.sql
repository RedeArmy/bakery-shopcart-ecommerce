/* =====================================================================
   Objeto   : Test_OrderTracking (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Consulta pública del estado de un pedido con su número y el correo
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
-- cspell:disable
EXEC tSQLt.NewTestClass 'Test_OrderTracking';
GO

CREATE PROCEDURE Test_OrderTracking.SetUp
AS
BEGIN
    EXEC Test_Orders.SetUp;
END;
GO

CREATE PROCEDURE Test_OrderTracking.NewOrder @Number NVARCHAR(20) OUTPUT, @IDPayment INT = NULL OUTPUT
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-track-1', @Now = '2030-06-01T12:05:00', @IDOrder = @IDOrder OUTPUT,
         @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_OrderTracking.[test the number and the email of the order give its status, its dates and its history and nothing personal]
AS
BEGIN
    DECLARE @Number NVARCHAR(20);
    EXEC Test_OrderTracking.NewOrder @Number = @Number OUTPUT;

    -- Las siete columnas son todo lo que sale: si se agregara otra, INSERT EXEC fallaría
    CREATE TABLE #Result (OrderNumber NVARCHAR(20), StatusName NVARCHAR(30), PaymentStatusName NVARCHAR(30), CreatedAt DATETIME2(3), RequestedDeliveryDate DATE,
                          FulfilmentType NVARCHAR(10), PickupBranchName NVARCHAR(80), History NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Orders_Track @OrderNumber = @Number, @Email = N'ana@shopcart.test';

    DECLARE @Status NVARCHAR(30) = (SELECT StatusName FROM #Result);
    DECLARE @Type NVARCHAR(10) = (SELECT FulfilmentType FROM #Result);
    DECLARE @Steps INT = (SELECT COUNT(*) FROM #Result CROSS APPLY OPENJSON(History));

    EXEC tSQLt.AssertEqualsString @Expected = N'PendingPayment', @Actual = @Status;
    EXEC tSQLt.AssertEqualsString @Expected = N'Pickup', @Actual = @Type;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Steps;
END;
GO

CREATE PROCEDURE Test_OrderTracking.[test the email and the number are matched without caring about case or spaces]
AS
BEGIN
    DECLARE @Number NVARCHAR(20), @Lower NVARCHAR(30);
    EXEC Test_OrderTracking.NewOrder @Number = @Number OUTPUT;
    SET @Lower = N'  ' + LOWER(@Number) + N' ';

    CREATE TABLE #Result (OrderNumber NVARCHAR(20), StatusName NVARCHAR(30), PaymentStatusName NVARCHAR(30), CreatedAt DATETIME2(3), RequestedDeliveryDate DATE,
                          FulfilmentType NVARCHAR(10), PickupBranchName NVARCHAR(80), History NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Orders_Track @OrderNumber = @Lower, @Email = N'  ANA@Shopcart.TEST ';

    DECLARE @Found INT = (SELECT COUNT(*) FROM #Result WHERE OrderNumber = @Number);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
END;
GO

CREATE PROCEDURE Test_OrderTracking.[test another email answers like an order that does not exist]
AS
BEGIN
    DECLARE @Number NVARCHAR(20);
    EXEC Test_OrderTracking.NewOrder @Number = @Number OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_Track @OrderNumber = @Number, @Email = N'otra@shopcart.test';
END;
GO

CREATE PROCEDURE Test_OrderTracking.[test a number that does not exist is not found]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_Track @OrderNumber = N'PED-2030-999999', @Email = N'ana@shopcart.test';
END;
GO

CREATE PROCEDURE Test_OrderTracking.[test both data are required]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_Track @OrderNumber = N'  ', @Email = N'ana@shopcart.test';
END;
GO

-- El pago a la vista ---------------------------------------------------------------------------

CREATE PROCEDURE Test_OrderTracking.[test a new order shows its payment as pending]
AS
BEGIN
    DECLARE @Number NVARCHAR(20);
    EXEC Test_OrderTracking.NewOrder @Number = @Number OUTPUT;

    CREATE TABLE #Result (OrderNumber NVARCHAR(20), StatusName NVARCHAR(30), PaymentStatusName NVARCHAR(30), CreatedAt DATETIME2(3), RequestedDeliveryDate DATE,
                          FulfilmentType NVARCHAR(10), PickupBranchName NVARCHAR(80), History NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Orders_Track @OrderNumber = @Number, @Email = N'ana@shopcart.test';

    DECLARE @Payment NVARCHAR(30) = (SELECT PaymentStatusName FROM #Result);
    EXEC tSQLt.AssertEqualsString @Expected = N'Pending', @Actual = @Payment;
END;
GO

CREATE PROCEDURE Test_OrderTracking.[test a proof makes the payment under review and the history says so while the order stays pending payment]
AS
BEGIN
    DECLARE @Number NVARCHAR(20), @IDPayment INT;
    EXEC Test_OrderTracking.NewOrder @Number = @Number OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-TRACK-1';

    CREATE TABLE #Result (OrderNumber NVARCHAR(20), StatusName NVARCHAR(30), PaymentStatusName NVARCHAR(30), CreatedAt DATETIME2(3), RequestedDeliveryDate DATE,
                          FulfilmentType NVARCHAR(10), PickupBranchName NVARCHAR(80), History NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Orders_Track @OrderNumber = @Number, @Email = N'ana@shopcart.test';

    DECLARE @Order NVARCHAR(30) = (SELECT StatusName FROM #Result);
    DECLARE @Payment NVARCHAR(30) = (SELECT PaymentStatusName FROM #Result);
    DECLARE @Event INT = (SELECT COUNT(*) FROM #Result CROSS APPLY OPENJSON(History) WITH (NewStatusName NVARCHAR(30)) AS h WHERE h.NewStatusName = N'PaymentUnderReview');

    EXEC tSQLt.AssertEqualsString @Expected = N'PendingPayment', @Actual = @Order;
    EXEC tSQLt.AssertEqualsString @Expected = N'UnderReview', @Actual = @Payment;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Event;
END;
GO

CREATE PROCEDURE Test_OrderTracking.[test a rejected deposit shows as rejected in the history and the payment]
AS
BEGIN
    DECLARE @Number NVARCHAR(20), @IDPayment INT, @Outcome VARCHAR(30);
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_OrderTracking.NewOrder @Number = @Number OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @IDPayment, @Hash = '0000000000000000000000000000000000000000000000000000000000000002', @Reference = N'REF-TRACK-2';
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Admin, @IDPayment = @IDPayment, @Reason = N'Blurry proof', @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;

    CREATE TABLE #Result (OrderNumber NVARCHAR(20), StatusName NVARCHAR(30), PaymentStatusName NVARCHAR(30), CreatedAt DATETIME2(3), RequestedDeliveryDate DATE,
                          FulfilmentType NVARCHAR(10), PickupBranchName NVARCHAR(80), History NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Orders_Track @OrderNumber = @Number, @Email = N'ana@shopcart.test';

    DECLARE @Payment NVARCHAR(30) = (SELECT PaymentStatusName FROM #Result);
    DECLARE @Rejected INT = (SELECT COUNT(*) FROM #Result CROSS APPLY OPENJSON(History) WITH (NewStatusName NVARCHAR(30)) AS h WHERE h.NewStatusName = N'PaymentRejected');

    EXEC tSQLt.AssertEqualsString @Expected = N'Rejected', @Actual = @Payment;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rejected;
END;
GO
