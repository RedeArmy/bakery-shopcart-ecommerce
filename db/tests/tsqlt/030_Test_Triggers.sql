/* =====================================================================
   Objeto   : Test_Triggers (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Los triggers de inmutabilidad y de transición de estado rechazan los cambios prohibidos
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Triggers';
GO

CREATE PROCEDURE Test_Triggers.SetUp
AS
BEGIN
    EXEC Test_Fixtures.CreateBaseData;

    -- Las transiciones válidas son datos que cargan las semillas; aquí se aseguran las dos que usan las pruebas
    IF NOT EXISTS (SELECT 1 FROM dbo.OrderStatusTransitions WHERE IDFromStatus = 1 AND IDToStatus = 2)
        INSERT INTO dbo.OrderStatusTransitions (IDFromStatus, IDToStatus) VALUES (1, 2);
    IF EXISTS (SELECT 1 FROM dbo.OrderStatusTransitions WHERE IDFromStatus = 1 AND IDToStatus = 5)
        DELETE FROM dbo.OrderStatusTransitions WHERE IDFromStatus = 1 AND IDToStatus = 5;

    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentStatusTransitions WHERE IDFromStatus = 1 AND IDToStatus = 3)
        INSERT INTO dbo.PaymentStatusTransitions (IDFromStatus, IDToStatus) VALUES (1, 3);
    IF EXISTS (SELECT 1 FROM dbo.PaymentStatusTransitions WHERE IDFromStatus = 1 AND IDToStatus = 7)
        DELETE FROM dbo.PaymentStatusTransitions WHERE IDFromStatus = 1 AND IDToStatus = 7;
END;
GO

-- Tablas de solo inserción -------------------------------------------------------------------

CREATE PROCEDURE Test_Triggers.[test the audit log cannot be updated]
AS
BEGIN
    INSERT INTO dbo.AuditLog (Module, EntityName, EntityKey, Action) VALUES (N'Products', N'Product', N'1', N'Create');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%audit log cannot be modified%', @ExpectedErrorNumber = 50422;
    UPDATE dbo.AuditLog SET EntityKey = N'2';
END;
GO

CREATE PROCEDURE Test_Triggers.[test the audit log cannot be deleted from]
AS
BEGIN
    INSERT INTO dbo.AuditLog (Module, EntityName, EntityKey, Action) VALUES (N'Products', N'Product', N'1', N'Create');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%audit log cannot be modified%', @ExpectedErrorNumber = 50422;
    DELETE FROM dbo.AuditLog;
END;
GO

CREATE PROCEDURE Test_Triggers.[test the financial ledger cannot be updated]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.FinancialMovements (IDOrder, Type, Amount) VALUES (@IDOrder, N'Fee', -3.00);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%financial ledger is append-only%', @ExpectedErrorNumber = 50422;
    UPDATE dbo.FinancialMovements SET Amount = -4.00;
END;
GO

CREATE PROCEDURE Test_Triggers.[test the inventory ledger cannot be deleted from]
AS
BEGIN
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'FIXTURE-SKU');
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser)
    VALUES (@IDVariant, 2, -1, 4, N'Sale', @IDUser);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%inventory ledger is append-only%', @ExpectedErrorNumber = 50422;
    DELETE FROM dbo.InventoryMovements;
END;
GO

CREATE PROCEDURE Test_Triggers.[test the order status history cannot be updated]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.OrderStatusHistory (IDOrder, IDNewStatus) VALUES (@IDOrder, 1);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%order status history cannot be modified%', @ExpectedErrorNumber = 50422;
    UPDATE dbo.OrderStatusHistory SET Comment = N'edited';
END;
GO

-- Transiciones de estado ---------------------------------------------------------------------

CREATE PROCEDURE Test_Triggers.[test an allowed order transition is accepted]
AS
BEGIN
    UPDATE dbo.Orders SET IDOrderStatus = 2, PaidAt = SYSUTCDATETIME() WHERE OrderNumber = N'FIX-0001';

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Status;
END;
GO

CREATE PROCEDURE Test_Triggers.[test a forbidden order transition is rejected]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%order status transition is not allowed%', @ExpectedErrorNumber = 50422;
    UPDATE dbo.Orders SET IDOrderStatus = 5, PaidAt = SYSUTCDATETIME() WHERE OrderNumber = N'FIX-0001';
END;
GO

CREATE PROCEDURE Test_Triggers.[test an allowed payment transition is accepted]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 1, 125.00, N'fixture-key-1', '2030-01-01');

    UPDATE dbo.Payments SET IDPaymentStatus = 3 WHERE IdempotencyKey = N'fixture-key-1';

    DECLARE @Status INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IdempotencyKey = N'fixture-key-1');
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Status;
END;
GO

CREATE PROCEDURE Test_Triggers.[test a forbidden payment transition is rejected]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 1, 125.00, N'fixture-key-1', '2030-01-01');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%payment status transition is not allowed%', @ExpectedErrorNumber = 50422;
    UPDATE dbo.Payments SET IDPaymentStatus = 7 WHERE IdempotencyKey = N'fixture-key-1';
END;
GO

-- Montos congelados --------------------------------------------------------------------------

CREATE PROCEDURE Test_Triggers.[test the amounts of an order cannot change]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%amounts of an order are immutable%', @ExpectedErrorNumber = 50422;
    UPDATE dbo.Orders SET Subtotal = Subtotal WHERE OrderNumber = N'FIX-0001';
END;
GO

CREATE PROCEDURE Test_Triggers.[test the price of an order line cannot change]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%lines of an order are immutable%', @ExpectedErrorNumber = 50422;
    UPDATE dbo.OrderLines SET UnitPrice = UnitPrice WHERE SKU = N'FIXTURE-SKU';
END;
GO

-- Lo único que puede cambiar en una línea es la cantidad devuelta
CREATE PROCEDURE Test_Triggers.[test the returned quantity of an order line can change]
AS
BEGIN
    UPDATE dbo.OrderLines SET ReturnedQuantity = 2 WHERE SKU = N'FIXTURE-SKU';

    DECLARE @Returned INT = (SELECT ReturnedQuantity FROM dbo.OrderLines WHERE SKU = N'FIXTURE-SKU');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Returned;
END;
GO

CREATE PROCEDURE Test_Triggers.[test the amount of a payment cannot change]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 1, 125.00, N'fixture-key-1', '2030-01-01');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%amount of a payment is immutable%', @ExpectedErrorNumber = 50422;
    UPDATE dbo.Payments SET Amount = 1.00 WHERE IdempotencyKey = N'fixture-key-1';
END;
GO
