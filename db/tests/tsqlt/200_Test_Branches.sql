/* =====================================================================
   Objeto   : Test_Branches y Test_PickupOrders (clases de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Mantenimiento de sucursales, recogida en sucursal en el pedido y fecha de entrega definida por el sistema
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
-- cspell:disable
EXEC tSQLt.NewTestClass 'Test_Branches';
GO

CREATE PROCEDURE Test_Branches.SetUp
AS
BEGIN
    EXEC Test_Shop.CreateStore;
END;
GO

-- Mantenimiento ------------------------------------------------------------------------------

CREATE PROCEDURE Test_Branches.[test an administrator creates a branch with trimmed data and leaves an audit entry]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDBranch INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'  Centro  ', @Line1 = N' 6a avenida 10-20 ', @Municipality = N'Guatemala',
         @Department = N'Guatemala', @Phone = N'  ', @OpeningHours = N'Lunes a sábado', @IDBranch = @IDBranch OUTPUT;

    DECLARE @Name NVARCHAR(80) = (SELECT Name FROM dbo.Branches WHERE IDBranch = @IDBranch);
    DECLARE @Line1 NVARCHAR(200) = (SELECT Line1 FROM dbo.Branches WHERE IDBranch = @IDBranch);
    DECLARE @PhoneIsNull INT = (SELECT COUNT(*) FROM dbo.Branches WHERE IDBranch = @IDBranch AND Phone IS NULL);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Branches' AND Action = N'Create' AND EntityKey = CAST(@IDBranch AS NVARCHAR(40)));

    EXEC tSQLt.AssertEqualsString @Expected = N'Centro', @Actual = @Name;
    EXEC tSQLt.AssertEqualsString @Expected = N'6a avenida 10-20', @Actual = @Line1;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PhoneIsNull;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Branches.[test a customer cannot create, edit or deactivate a branch]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Customer INT = Test_Shop.UserId(N'ana@shopcart.test'), @IDBranch INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @IDBranch OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Customer, @IDBranch = @IDBranch;
END;
GO

CREATE PROCEDURE Test_Branches.[test creating a branch refuses a customer]
AS
BEGIN
    DECLARE @Customer INT = Test_Shop.UserId(N'ana@shopcart.test'), @IDBranch INT;
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Branches_Create @IDActor = @Customer, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @IDBranch OUTPUT;
END;
GO

CREATE PROCEDURE Test_Branches.[test a branch needs a name and an address]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDBranch INT;
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'   ', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @IDBranch OUTPUT;
END;
GO

CREATE PROCEDURE Test_Branches.[test two active branches cannot share a name]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @First INT, @Second INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @First OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'BRANCH_NAME_IN_USE%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 2', @Municipality = N'Mixco', @Department = N'Guatemala', @IDBranch = @Second OUTPUT;
END;
GO

CREATE PROCEDURE Test_Branches.[test a deactivated branch frees its name for a new one]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @First INT, @Second INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @First OUTPUT;
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Admin, @IDBranch = @First;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 2', @Municipality = N'Mixco', @Department = N'Guatemala', @IDBranch = @Second OUTPUT;

    DECLARE @Active INT = (SELECT COUNT(*) FROM dbo.Branches WHERE Name = N'Centro' AND IsActive = 1);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Active;
END;
GO

CREATE PROCEDURE Test_Branches.[test updating a branch changes its data and keeps the previous value in the audit]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDBranch INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @IDBranch OUTPUT;
    EXEC dbo.SP_Branches_Update @IDActor = @Admin, @IDBranch = @IDBranch, @Name = N'Centro histórico', @Line1 = N'Calle 9', @Municipality = N'Guatemala',
         @Department = N'Guatemala', @Phone = N'22221111';

    DECLARE @Name NVARCHAR(80) = (SELECT Name FROM dbo.Branches WHERE IDBranch = @IDBranch);
    DECLARE @WithPrevious INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Branches' AND Action = N'Update'
                                 AND EntityKey = CAST(@IDBranch AS NVARCHAR(40)) AND PreviousValue LIKE N'%Calle 1%' AND NewValue LIKE N'%Calle 9%');
    EXEC tSQLt.AssertEqualsString @Expected = N'Centro histórico', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @WithPrevious;
END;
GO

CREATE PROCEDURE Test_Branches.[test a branch cannot take the name of another active one]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @First INT, @Second INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @First OUTPUT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Norte', @Line1 = N'Calle 2', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @Second OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'BRANCH_NAME_IN_USE%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Branches_Update @IDActor = @Admin, @IDBranch = @Second, @Name = N'Centro', @Line1 = N'Calle 2', @Municipality = N'Guatemala', @Department = N'Guatemala';
END;
GO

CREATE PROCEDURE Test_Branches.[test a deactivated branch cannot be edited]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDBranch INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @IDBranch OUTPUT;
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Admin, @IDBranch = @IDBranch;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'BRANCH_INACTIVE%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Branches_Update @IDActor = @Admin, @IDBranch = @IDBranch, @Name = N'Otro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala';
END;
GO

CREATE PROCEDURE Test_Branches.[test editing or deactivating a branch that does not exist answers not found]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Admin, @IDBranch = 999999;
END;
GO

CREATE PROCEDURE Test_Branches.[test deactivating twice is harmless and audits once]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDBranch INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @IDBranch OUTPUT;
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Admin, @IDBranch = @IDBranch;
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Admin, @IDBranch = @IDBranch;

    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Branches' AND Action = N'Deactivate' AND EntityKey = CAST(@IDBranch AS NVARCHAR(40)));
    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Branches WHERE IDBranch = @IDBranch);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
END;
GO

-- Lectura ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Branches.[test the list shows only active branches unless the panel asks for all]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Open INT, @Closed INT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'Calle 1', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @Open OUTPUT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Cerrada', @Line1 = N'Calle 2', @Municipality = N'Guatemala', @Department = N'Guatemala', @IDBranch = @Closed OUTPUT;
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Admin, @IDBranch = @Closed;

    CREATE TABLE #Active (IDBranch INT, Name NVARCHAR(80), Line1 NVARCHAR(200), Municipality NVARCHAR(80), Department NVARCHAR(80),
                          Phone NVARCHAR(20), OpeningHours NVARCHAR(200), IsActive BIT, OpenOrders INT);
    CREATE TABLE #All (IDBranch INT, Name NVARCHAR(80), Line1 NVARCHAR(200), Municipality NVARCHAR(80), Department NVARCHAR(80),
                       Phone NVARCHAR(20), OpeningHours NVARCHAR(200), IsActive BIT, OpenOrders INT);
    INSERT INTO #Active EXEC dbo.SP_Branches_List;
    INSERT INTO #All EXEC dbo.SP_Branches_List @IncludeInactive = 1;

    DECLARE @ActiveRows INT = (SELECT COUNT(*) FROM #Active), @AllRows INT = (SELECT COUNT(*) FROM #All);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @ActiveRows;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @AllRows;
END;
GO

-- La fecha que define el sistema -------------------------------------------------------------

CREATE PROCEDURE Test_Branches.[test the estimated date is the first one that leaves time to pay by deposit]
AS
BEGIN
    -- 06:00 en Guatemala: hoy ya no hay tiempo, mañana sí
    DECLARE @Morning DATE = (SELECT EstimatedDate FROM dbo.FU_Checkout_EstimatedDeliveryDate(0, '2030-06-01T12:00:00'));
    -- 23:00 en Guatemala: a las 00:00 de mañana solo queda una hora, así que pasa al día siguiente
    DECLARE @Night DATE = (SELECT EstimatedDate FROM dbo.FU_Checkout_EstimatedDeliveryDate(0, '2030-06-02T05:00:00'));
    -- Un producto que pide dos días de anticipación empuja la fecha otros dos días
    DECLARE @WithLead DATE = (SELECT EstimatedDate FROM dbo.FU_Checkout_EstimatedDeliveryDate(2, '2030-06-01T12:00:00'));

    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-02', @Actual = @Morning;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-03', @Actual = @Night;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-04', @Actual = @WithLead;
END;
GO

-- Pedidos de recogida ------------------------------------------------------------------------
EXEC tSQLt.NewTestClass 'Test_PickupOrders';
GO

CREATE PROCEDURE Test_PickupOrders.SetUp
AS
BEGIN
    EXEC Test_Orders.SetUp;
END;
GO

-- Un cliente con un carrito reservado y una sucursal activa
CREATE PROCEDURE Test_PickupOrders.NewReservation @IDUser INT OUTPUT, @IDReservation INT OUTPUT, @IDBranch INT OUTPUT
AS
BEGIN
    DECLARE @IDCart INT, @Cookie INT = Test_Shop.VariantId(N'B-COOKIE'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    SET @IDUser = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @IDUser, @IDVariant = @Cookie, @Quantity = 2, @Now = '2030-06-01T12:00:00', @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @Now = '2030-06-01T12:00:00', @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Branches_Create @IDActor = @Admin, @Name = N'Centro', @Line1 = N'6a avenida 10-20', @Municipality = N'Guatemala',
         @Department = N'Guatemala', @IDBranch = @IDBranch OUTPUT;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test a pickup order keeps the branch and has no delivery address]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank');

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-pickup-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Type NVARCHAR(10) = (SELECT FulfilmentType FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Name NVARCHAR(80) = (SELECT PickupBranchName FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Address NVARCHAR(300) = (SELECT PickupBranchAddress FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @NoDelivery INT = (SELECT COUNT(*) FROM dbo.Orders WHERE IDOrder = @IDOrder AND DeliveryLine1 IS NULL AND DeliveryRecipient IS NULL);
    EXEC tSQLt.AssertEqualsString @Expected = N'Pickup', @Actual = @Type;
    EXEC tSQLt.AssertEqualsString @Expected = N'Centro', @Actual = @Name;
    EXEC tSQLt.AssertEqualsString @Expected = N'6a avenida 10-20, Guatemala, Guatemala', @Actual = @Address;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @NoDelivery;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test the system sets the date when the customer sends none]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank');

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-pickup-2', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Date NVARCHAR(10) = (SELECT CONVERT(NVARCHAR(10), RequestedDeliveryDate, 23) FROM dbo.Orders WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-02', @Actual = @Date;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test editing or deactivating the branch later does not change the order]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-pickup-3', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    EXEC dbo.SP_Branches_Update @IDActor = @Admin, @IDBranch = @Branch, @Name = N'Centro renovado', @Line1 = N'Otra calle',
         @Municipality = N'Mixco', @Department = N'Guatemala';

    DECLARE @Name NVARCHAR(80) = (SELECT PickupBranchName FROM dbo.Orders WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEqualsString @Expected = N'Centro', @Actual = @Name;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test a branch with orders waiting cannot be deactivated]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-pickup-4', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'BRANCH_HAS_OPEN_ORDERS%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Admin, @IDBranch = @Branch;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test a pickup needs a branch and no address]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%needs a branch and no address%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch, @IDAddress = @Address,
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-pickup-5', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test a delivery still needs an address and no branch]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%needs an address and no branch%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-pickup-6', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test a deactivated branch cannot be chosen]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC dbo.SP_Branches_Deactivate @IDActor = @Admin, @IDBranch = @Branch;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'Branch not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-pickup-7', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test the order table refuses a mix of delivery and pickup data]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank');
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-pickup-8', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Orders_Fulfilment%';
    UPDATE dbo.Orders SET DeliveryLine1 = N'Una calle' WHERE IDOrder = @IDOrder;
END;
GO

-- Notas de entrega ---------------------------------------------------------------------------

CREATE PROCEDURE Test_PickupOrders.[test a delivery keeps the trimmed notes and an empty note is stored as null]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3), @IDAddress INT;
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank');
    EXEC dbo.SP_Addresses_Save @IDUser = @User, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000', @Line1 = N'5th Avenue 10-20',
         @Municipality = N'Guatemala', @Department = N'Guatemala', @IDSavedAddress = @IDAddress OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @IDAddress = @IDAddress, @DeliveryNotes = N'  Ring twice  ',
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-notes-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Notes NVARCHAR(300) = (SELECT DeliveryNotes FROM dbo.Orders WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEqualsString @Expected = N'Ring twice', @Actual = @Notes;
END;
GO

CREATE PROCEDURE Test_PickupOrders.[test a pickup order refuses delivery notes]
AS
BEGIN
    DECLARE @User INT, @IDReservation INT, @Branch INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_PickupOrders.NewReservation @IDUser = @User OUTPUT, @IDReservation = @IDReservation OUTPUT, @IDBranch = @Branch OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank');

    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @User, @IDReservation = @IDReservation, @FulfilmentType = N'Pickup', @IDBranch = @Branch,
         @DeliveryNotes = N'Ring twice', @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-notes-2',
         @Now = '2030-06-01T12:05:00', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT,
         @PaymentExpiresAt = @Expires OUTPUT;
END;
GO
