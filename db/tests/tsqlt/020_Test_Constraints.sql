/* =====================================================================
   Objeto   : Test_Constraints (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Cada restricción CHECK e índice único que protege dinero, existencias y pagos rechaza lo inválido
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Constraints';
GO

CREATE PROCEDURE Test_Constraints.SetUp
AS
BEGIN
    EXEC Test_Fixtures.CreateBaseData;
END;
GO

-- Control positivo: si el dato base no se inserta, las pruebas de rechazo no demostrarían nada
CREATE PROCEDURE Test_Constraints.[test the fixture order is accepted]
AS
BEGIN
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

-- Existencias --------------------------------------------------------------------------------

CREATE PROCEDURE Test_Constraints.[test reserved stock cannot exceed on-hand stock]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Variants_ReservedVsOnHand%';
    UPDATE dbo.Variants SET ReservedStock = OnHandStock + 1 WHERE SKU = N'FIXTURE-SKU';
END;
GO

CREATE PROCEDURE Test_Constraints.[test on-hand stock cannot be negative]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Variants_OnHandStock%';
    UPDATE dbo.Variants SET OnHandStock = -1 WHERE SKU = N'FIXTURE-SKU';
END;
GO

CREATE PROCEDURE Test_Constraints.[test a variant price must be positive]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Variants_Price%';
    UPDATE dbo.Variants SET Price = 0 WHERE SKU = N'FIXTURE-SKU';
END;
GO

CREATE PROCEDURE Test_Constraints.[test only one exit per order and variant is allowed]
AS
BEGIN
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'FIXTURE-SKU');
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');

    INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser, IDOrder)
    VALUES (@IDVariant, 2, -1, 4, N'First exit', @IDUser, @IDOrder);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UX_InventoryMovements_OneExitPerOrder%';
    INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser, IDOrder)
    VALUES (@IDVariant, 2, -1, 3, N'Second exit', @IDUser, @IDOrder);
END;
GO

-- Pedidos ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Constraints.[test an order total must match subtotal minus discount plus shipping]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Orders_Total%';
    UPDATE dbo.Orders SET Total = 999.00, TaxableBase = 891.96, Vat = 107.04 WHERE OrderNumber = N'FIX-0001';
END;
GO

CREATE PROCEDURE Test_Constraints.[test taxable base plus VAT must equal the total]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Orders_Vat%';
    UPDATE dbo.Orders SET Vat = 14.00 WHERE OrderNumber = N'FIX-0001';
END;
GO

CREATE PROCEDURE Test_Constraints.[test an order past pending payment needs a payment date]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Orders_PaidAt%';
    UPDATE dbo.Orders SET IDOrderStatus = 2 WHERE OrderNumber = N'FIX-0001';
END;
GO

CREATE PROCEDURE Test_Constraints.[test a line cannot return more than it sold]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_OrderLines_ReturnedQuantity%';
    UPDATE dbo.OrderLines SET ReturnedQuantity = Quantity + 1 WHERE SKU = N'FIXTURE-SKU';
END;
GO

CREATE PROCEDURE Test_Constraints.[test a line total must match quantity times price minus discount]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_OrderLines_LineTotal%';
    UPDATE dbo.OrderLines SET LineTotal = 1.00 WHERE SKU = N'FIXTURE-SKU';
END;
GO

-- Carrito y cupones --------------------------------------------------------------------------

CREATE PROCEDURE Test_Constraints.[test a cart needs a user or a guest token]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Carts_Owner%';
    INSERT INTO dbo.Carts (Status) VALUES (N'Active');
END;
GO

CREATE PROCEDURE Test_Constraints.[test a user can have only one active cart]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@IDUser, N'Active');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UX_Carts_OneActivePerUser%';
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@IDUser, N'Active');
END;
GO

CREATE PROCEDURE Test_Constraints.[test a user can keep several converted carts]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@IDUser, N'Converted');
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@IDUser, N'Converted');

    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDUser = @IDUser);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

-- CI: el mismo correo con otra capitalización es el mismo correo
CREATE PROCEDURE Test_Constraints.[test an e-mail address is unique regardless of case]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UQ_Users_Email%';
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (1, N'FIXTURE.CUSTOMER@SHOPCART.TEST', N'not-a-real-hash', N'Duplicate');
END;
GO

-- AS: un nombre con acento y otro sin él son distintos ("Té" y "Te"); la búsqueda sin acentos se pide con COLLATE
CREATE PROCEDURE Test_Constraints.[test category names that differ only by an accent are distinct]
AS
BEGIN
    INSERT INTO dbo.Categories (Name) VALUES (N'Te'), (N'T' + NCHAR(0x00E9));

    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Categories WHERE Name IN (N'Te', N'T' + NCHAR(0x00E9)));
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

CREATE PROCEDURE Test_Constraints.[test a guest token cannot be used by two carts]
AS
BEGIN
    DECLARE @Token UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Carts (GuestToken, Status) VALUES (@Token, N'Active');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UX_Carts_GuestToken%';
    INSERT INTO dbo.Carts (GuestToken, Status) VALUES (@Token, N'Active');
END;
GO

CREATE PROCEDURE Test_Constraints.[test a percentage coupon cannot exceed 100]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Coupons_Percentage%';
    INSERT INTO dbo.Coupons (Code, Type, Value, StartsAt, EndsAt)
    VALUES (N'TOO-MUCH', N'Percentage', 101.00, '2030-01-01', '2030-02-01');
END;
GO

CREATE PROCEDURE Test_Constraints.[test a coupon cannot end before it starts]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Coupons_Dates%';
    INSERT INTO dbo.Coupons (Code, Type, Value, StartsAt, EndsAt)
    VALUES (N'BACKWARDS', N'FixedAmount', 5.00, '2030-02-01', '2030-01-01');
END;
GO

CREATE PROCEDURE Test_Constraints.[test a coupon usage count cannot pass its total limit]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Coupons_UsageVsLimit%';
    INSERT INTO dbo.Coupons (Code, Type, Value, StartsAt, EndsAt, TotalUsageLimit, UsageCount)
    VALUES (N'OVERUSED', N'FixedAmount', 5.00, '2030-01-01', '2030-02-01', 1, 2);
END;
GO

-- Pagos y dinero -----------------------------------------------------------------------------

CREATE PROCEDURE Test_Constraints.[test an order cannot have two open payment attempts]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 1, 125.00, N'fixture-key-1', '2030-01-01');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UX_Payments_OneOpenAttempt%';
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 2, 125.00, N'fixture-key-2', '2030-01-01');
END;
GO

CREATE PROCEDURE Test_Constraints.[test an order cannot have two approved payments]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 3, 125.00, N'fixture-key-1', '2030-01-01');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UX_Payments_OneApproved%';
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 1, 3, 125.00, N'fixture-key-2', '2030-01-01');
END;
GO

CREATE PROCEDURE Test_Constraints.[test a rejected attempt does not block a new one]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 4, 125.00, N'fixture-key-1', '2030-01-01');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 1, 125.00, N'fixture-key-2', '2030-01-01');

    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Payments WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

CREATE PROCEDURE Test_Constraints.[test a payment amount must be positive]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Payments_Amount%';
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 1, 0.00, N'fixture-key-1', '2030-01-01');
END;
GO

CREATE PROCEDURE Test_Constraints.[test an external reference only fits a card payment]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Payments_ExternalOnlyForCard%';
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExternalReference, ExpiresAt)
    VALUES (@IDOrder, 2, 1, 125.00, N'fixture-key-1', N'ch_123', '2030-01-01');
END;
GO

CREATE PROCEDURE Test_Constraints.[test a payment proof must be an accepted file type]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 1, 125.00, N'fixture-key-1', '2030-01-01');
    DECLARE @IDPayment INT = (SELECT IDPayment FROM dbo.Payments WHERE IdempotencyKey = N'fixture-key-1');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_PaymentProofs_MimeType%';
    INSERT INTO dbo.PaymentProofs (IDPayment, OriginalFileName, StorageKey, MimeType, SizeBytes, Sha256Hash, IDUser)
    VALUES (@IDPayment, N'proof.exe', N'key-1', N'application/x-msdownload', 100, REPLICATE('a', 64), @IDUser);
END;
GO

CREATE PROCEDURE Test_Constraints.[test the ledger rejects a charge with a negative amount]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_FinancialMovements_Sign%';
    INSERT INTO dbo.FinancialMovements (IDOrder, Type, Amount) VALUES (@IDOrder, N'Charge', -10.00);
END;
GO

CREATE PROCEDURE Test_Constraints.[test the ledger rejects a refund with a positive amount]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_FinancialMovements_Sign%';
    INSERT INTO dbo.FinancialMovements (IDOrder, Type, Amount) VALUES (@IDOrder, N'Refund', 10.00);
END;
GO

CREATE PROCEDURE Test_Constraints.[test a payment can only be charged once in the ledger]
AS
BEGIN
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt)
    VALUES (@IDOrder, 2, 3, 125.00, N'fixture-key-1', '2030-01-01');
    DECLARE @IDPayment INT = (SELECT IDPayment FROM dbo.Payments WHERE IdempotencyKey = N'fixture-key-1');

    INSERT INTO dbo.FinancialMovements (IDOrder, IDPayment, Type, Amount) VALUES (@IDOrder, @IDPayment, N'Charge', 125.00);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UX_FinancialMovements_OneChargePerPayment%';
    INSERT INTO dbo.FinancialMovements (IDOrder, IDPayment, Type, Amount) VALUES (@IDOrder, @IDPayment, N'Charge', 125.00);
END;
GO

-- Idempotencia y auditoría -------------------------------------------------------------------

CREATE PROCEDURE Test_Constraints.[test the same idempotency key cannot be stored twice for a scope and route]
AS
BEGIN
    INSERT INTO dbo.IdempotentRequests (Scope, Method, Route, IdempotencyKey, RequestHash, Status, ExpiresAt)
    VALUES (N'U:1', N'POST', N'/api/v1/orders', N'key-1', REPLICATE('a', 64), N'InProgress', '2030-01-01');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UQ_IdempotentRequests_Key%';
    INSERT INTO dbo.IdempotentRequests (Scope, Method, Route, IdempotencyKey, RequestHash, Status, ExpiresAt)
    VALUES (N'U:1', N'POST', N'/api/v1/orders', N'key-1', REPLICATE('b', 64), N'InProgress', '2030-01-01');
END;
GO

CREATE PROCEDURE Test_Constraints.[test the audit log only accepts JSON values]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_AuditLog_NewValue%';
    INSERT INTO dbo.AuditLog (Module, EntityName, EntityKey, Action, NewValue)
    VALUES (N'Products', N'Product', N'1', N'Create', N'this is not json');
END;
GO

CREATE PROCEDURE Test_Constraints.[test the audit log only accepts known actions]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_AuditLog_Action%';
    INSERT INTO dbo.AuditLog (Module, EntityName, EntityKey, Action)
    VALUES (N'Products', N'Product', N'1', N'Delete');
END;
GO
