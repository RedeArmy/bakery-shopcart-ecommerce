/* =====================================================================
   Objeto   : Test_Ledger (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Entradas, ajustes y consulta del libro de inventario, y las vistas de disponibilidad y conciliación
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). La carrera entre entradas simultáneas la cubre
              npm run sql:concurrency.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Ledger';
GO

-- Un administrador, un cliente y dos variantes sin existencias. Los valores de referencia se insertan solo si faltan,
-- por si la prueba corre sin semillas.
CREATE PROCEDURE Test_Ledger.SetUp
AS
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 1) INSERT INTO dbo.Roles (IDRole, Name) VALUES (1, N'Customer');
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 3) INSERT INTO dbo.Roles (IDRole, Name) VALUES (3, N'Administrator');
    IF NOT EXISTS (SELECT 1 FROM dbo.InventoryMovementTypes WHERE IDInventoryMovementType = 1) INSERT INTO dbo.InventoryMovementTypes VALUES (1, N'Entry');
    IF NOT EXISTS (SELECT 1 FROM dbo.InventoryMovementTypes WHERE IDInventoryMovementType = 3) INSERT INTO dbo.InventoryMovementTypes VALUES (3, N'Adjustment');

    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (3, N'admin@shopcart.test', N'not-a-real-hash', N'Test Admin'),
           (1, N'customer@shopcart.test', N'not-a-real-hash', N'Test Customer');

    INSERT INTO dbo.Categories (Name) VALUES (N'Ledger category');
    INSERT INTO dbo.Products (IDCategory, Name) SELECT IDCategory, N'Ledger product' FROM dbo.Categories WHERE Name = N'Ledger category';
    INSERT INTO dbo.Variants (IDProduct, SKU, Price) SELECT IDProduct, N'LEDGER-1', 10.00 FROM dbo.Products WHERE Name = N'Ledger product';
    INSERT INTO dbo.Variants (IDProduct, SKU, Price) SELECT IDProduct, N'LEDGER-2', 12.00 FROM dbo.Products WHERE Name = N'Ledger product';
END;
GO

-- Entradas ----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Ledger.[test an entry adds the stock and writes a positive movement with the resulting balance]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 12, @Reason = N' Supplier delivery ',
         @IDMovement = @IDMovement OUTPUT;

    DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.Variants WHERE IDVariant = @IDVariant);
    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.InventoryMovements WHERE IDInventoryMovement = @IDMovement AND IDInventoryMovementType = 1);
    DECLARE @Balance INT = (SELECT ResultingBalance FROM dbo.InventoryMovements WHERE IDInventoryMovement = @IDMovement);
    DECLARE @Reason NVARCHAR(250) = (SELECT Reason FROM dbo.InventoryMovements WHERE IDInventoryMovement = @IDMovement);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Stock' AND EntityKey = CAST(@IDVariant AS NVARCHAR(40)) AND IDUser = @IDAdmin);

    EXEC tSQLt.AssertEquals @Expected = 12, @Actual = @OnHand;
    EXEC tSQLt.AssertEquals @Expected = 12, @Actual = @Quantity;
    EXEC tSQLt.AssertEquals @Expected = 12, @Actual = @Balance;
    EXEC tSQLt.AssertEqualsString @Expected = N'Supplier delivery', @Actual = @Reason;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Ledger.[test successive entries accumulate in the resulting balance]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @First BIGINT, @Second BIGINT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 3, @Reason = N'First', @IDMovement = @First OUTPUT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 5, @Reason = N'Second', @IDMovement = @Second OUTPUT;

    DECLARE @FirstBalance INT = (SELECT ResultingBalance FROM dbo.InventoryMovements WHERE IDInventoryMovement = @First);
    DECLARE @SecondBalance INT = (SELECT ResultingBalance FROM dbo.InventoryMovements WHERE IDInventoryMovement = @Second);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @FirstBalance;
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @SecondBalance;
END;
GO

CREATE PROCEDURE Test_Ledger.[test only an administrator can register an entry]
AS
BEGIN
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDCustomer, @IDVariant = @IDVariant, @Quantity = 1, @Reason = N'Free stock', @IDMovement = @IDMovement OUTPUT;
END;
GO

CREATE PROCEDURE Test_Ledger.[test an entry for an unknown variant answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDMovement BIGINT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Variant not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = -1, @Quantity = 1, @Reason = N'Ghost', @IDMovement = @IDMovement OUTPUT;
END;
GO

CREATE PROCEDURE Test_Ledger.[test an entry of zero or fewer units is rejected]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Quantity greater than zero%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 0, @Reason = N'Nothing', @IDMovement = @IDMovement OUTPUT;
END;
GO

CREATE PROCEDURE Test_Ledger.[test an entry without a reason is rejected]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Reason%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 1, @Reason = N'   ', @IDMovement = @IDMovement OUTPUT;
END;
GO

CREATE PROCEDURE Test_Ledger.[test an entry that would overflow the stored quantity is refused]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    UPDATE dbo.Variants SET OnHandStock = 2147483640 WHERE IDVariant = @IDVariant;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%exceed the maximum%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 10, @Reason = N'Too much', @IDMovement = @IDMovement OUTPUT;
END;
GO

-- Ajustes -----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Ledger.[test an adjustment up and down writes signed movements]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT, @Up BIGINT, @Down BIGINT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 5, @Reason = N'Opening stock', @IDMovement = @IDMovement OUTPUT;

    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewOnHand = 8, @Reason = N'Count found more', @IDMovement = @Up OUTPUT;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewOnHand = 2, @Reason = N'Broken units', @IDMovement = @Down OUTPUT;

    DECLARE @UpQuantity INT = (SELECT Quantity FROM dbo.InventoryMovements WHERE IDInventoryMovement = @Up AND IDInventoryMovementType = 3);
    DECLARE @DownQuantity INT = (SELECT Quantity FROM dbo.InventoryMovements WHERE IDInventoryMovement = @Down AND IDInventoryMovementType = 3);
    DECLARE @DownBalance INT = (SELECT ResultingBalance FROM dbo.InventoryMovements WHERE IDInventoryMovement = @Down);
    DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.Variants WHERE IDVariant = @IDVariant);

    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @UpQuantity;
    EXEC tSQLt.AssertEquals @Expected = -6, @Actual = @DownQuantity;   -- de 8 a 2
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @DownBalance;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @OnHand;
END;
GO

CREATE PROCEDURE Test_Ledger.[test a count equal to the stock writes no movement and no audit entry]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT = 999;

    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewOnHand = 0, @Reason = N'Count matches', @IDMovement = @IDMovement OUTPUT;

    DECLARE @Movements INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDVariant = @IDVariant);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Stock');
    DECLARE @HasMovement INT = CASE WHEN @IDMovement IS NULL THEN 0 ELSE 1 END;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Movements;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Audit;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @HasMovement;
END;
GO

CREATE PROCEDURE Test_Ledger.[test the stock cannot be set below the reserved units]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    UPDATE dbo.Variants SET OnHandStock = 6, ReservedStock = 4 WHERE IDVariant = @IDVariant;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%below the reserved units%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewOnHand = 3, @Reason = N'Count', @IDMovement = @IDMovement OUTPUT;
END;
GO

CREATE PROCEDURE Test_Ledger.[test an adjustment needs a reason and a count of zero or more]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%NewOnHand of zero or more%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewOnHand = -1, @Reason = N'Negative', @IDMovement = @IDMovement OUTPUT;
END;
GO

CREATE PROCEDURE Test_Ledger.[test only an administrator can adjust the stock]
AS
BEGIN
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDCustomer, @IDVariant = @IDVariant, @NewOnHand = 9, @Reason = N'Count', @IDMovement = @IDMovement OUTPUT;
END;
GO

CREATE PROCEDURE Test_Ledger.[test adjusting an unknown variant answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDMovement BIGINT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Variant not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDAdmin, @IDVariant = -1, @NewOnHand = 1, @Reason = N'Count', @IDMovement = @IDMovement OUTPUT;
END;
GO

-- Consulta del libro ------------------------------------------------------------------------

CREATE PROCEDURE Test_Ledger.[test the ledger lists the newest movement first with its type and user]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 10, @Reason = N'Delivery', @IDMovement = @IDMovement OUTPUT;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewOnHand = 7, @Reason = N'Count', @IDMovement = @IDMovement OUTPUT;

    CREATE TABLE #Result (IDInventoryMovement BIGINT, MovementType NVARCHAR(30), Quantity INT, ResultingBalance INT, Reason NVARCHAR(250),
                          IDUser INT, UserName NVARCHAR(120), IDOrder INT, CreatedAt DATETIME2(3), TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Inventory_GetLedger @IDVariant = @IDVariant;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @FirstType NVARCHAR(30) = (SELECT TOP (1) MovementType FROM #Result ORDER BY IDInventoryMovement DESC);
    DECLARE @FirstBalance INT = (SELECT TOP (1) ResultingBalance FROM #Result ORDER BY IDInventoryMovement DESC);
    DECLARE @User NVARCHAR(120) = (SELECT TOP (1) UserName FROM #Result);
    DECLARE @Total INT = (SELECT MAX(TotalCount) FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'Adjustment', @Actual = @FirstType;
    EXEC tSQLt.AssertEquals @Expected = 7, @Actual = @FirstBalance;
    EXEC tSQLt.AssertEqualsString @Expected = N'Test Admin', @Actual = @User;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Ledger.[test the ledger pages its rows and filters by date]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 1, @Reason = N'January', @Now = '2030-01-10T10:00:00', @IDMovement = @IDMovement OUTPUT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 1, @Reason = N'February', @Now = '2030-02-10T10:00:00', @IDMovement = @IDMovement OUTPUT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 1, @Reason = N'March', @Now = '2030-03-10T10:00:00', @IDMovement = @IDMovement OUTPUT;

    CREATE TABLE #Result (IDInventoryMovement BIGINT, MovementType NVARCHAR(30), Quantity INT, ResultingBalance INT, Reason NVARCHAR(250),
                          IDUser INT, UserName NVARCHAR(120), IDOrder INT, CreatedAt DATETIME2(3), TotalCount INT);

    INSERT INTO #Result EXEC dbo.SP_Inventory_GetLedger @IDVariant = @IDVariant, @PageNumber = 2, @PageSize = 1;
    DECLARE @PageReason NVARCHAR(250) = (SELECT Reason FROM #Result);
    DECLARE @PageTotal INT = (SELECT MAX(TotalCount) FROM #Result);
    DELETE FROM #Result;

    INSERT INTO #Result EXEC dbo.SP_Inventory_GetLedger @IDVariant = @IDVariant, @From = '2030-02-01', @To = '2030-03-01';
    DECLARE @RangeRows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @RangeReason NVARCHAR(250) = (SELECT Reason FROM #Result);

    EXEC tSQLt.AssertEqualsString @Expected = N'February', @Actual = @PageReason;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @PageTotal;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @RangeRows;
    EXEC tSQLt.AssertEqualsString @Expected = N'February', @Actual = @RangeReason;
END;
GO

CREATE PROCEDURE Test_Ledger.[test the ledger of an unknown variant answers not found]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Variant not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Inventory_GetLedger @IDVariant = -1;
END;
GO

CREATE PROCEDURE Test_Ledger.[test the ledger rejects an invalid page size and a reversed range]
AS
BEGIN
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @PageError INT = 0, @RangeError INT = 0;
    BEGIN TRY EXEC dbo.SP_Inventory_GetLedger @IDVariant = @IDVariant, @PageSize = 101; END TRY
    BEGIN CATCH SET @PageError = ERROR_NUMBER(); END CATCH;
    BEGIN TRY EXEC dbo.SP_Inventory_GetLedger @IDVariant = @IDVariant, @From = '2030-03-01', @To = '2030-02-01'; END TRY
    BEGIN CATCH SET @RangeError = ERROR_NUMBER(); END CATCH;

    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @PageError;
    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @RangeError;
END;
GO

-- Vistas ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Ledger.[test the availability view subtracts the reserved units]
AS
BEGIN
    UPDATE dbo.Variants SET OnHandStock = 10, ReservedStock = 4 WHERE SKU = N'LEDGER-1';

    DECLARE @Available INT = (SELECT AvailableStock FROM dbo.VW_Inventory_Availability WHERE SKU = N'LEDGER-1');
    DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.VW_Inventory_Availability WHERE SKU = N'LEDGER-1');
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @Available;
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @OnHand;
END;
GO

-- El contrato del diseño: la conciliación devuelve cero filas cuando todo se hizo por los procedimientos
CREATE PROCEDURE Test_Ledger.[test the reconciliation is empty after entries adjustments and a reservation]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT, @IDReservation INT;
    IF NOT EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'ReservationMinutes')
        INSERT INTO dbo.Configuration (SettingKey, SettingValue) VALUES (N'ReservationMinutes', N'15');

    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 10, @Reason = N'Delivery', @IDMovement = @IDMovement OUTPUT;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewOnHand = 9, @Reason = N'Count', @IDMovement = @IDMovement OUTPUT;
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@IDCustomer, N'Active');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDCustomer);
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity) VALUES (@IDCart, @IDVariant, 4);
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDCustomer, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;

    DECLARE @Differences INT = (SELECT COUNT(*) FROM dbo.VW_Inventory_Reconciliation WHERE SKU IN (N'LEDGER-1', N'LEDGER-2'));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Differences;
END;
GO

-- Cambiar la existencia sin pasar por el libro es justo lo que la vista debe delatar
CREATE PROCEDURE Test_Ledger.[test the reconciliation reports stock changed without a movement]
AS
BEGIN
    UPDATE dbo.Variants SET OnHandStock = 3 WHERE SKU = N'LEDGER-2';

    DECLARE @Issue NVARCHAR(30) = (SELECT Issue FROM dbo.VW_Inventory_Reconciliation WHERE SKU = N'LEDGER-2');
    DECLARE @Expected BIGINT = (SELECT Expected FROM dbo.VW_Inventory_Reconciliation WHERE SKU = N'LEDGER-2');
    DECLARE @Actual BIGINT = (SELECT Actual FROM dbo.VW_Inventory_Reconciliation WHERE SKU = N'LEDGER-2');
    EXEC tSQLt.AssertEqualsString @Expected = N'OnHandVsLedger', @Actual = @Issue;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Expected;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Actual;
END;
GO

CREATE PROCEDURE Test_Ledger.[test the reconciliation reports reserved units without an active reservation]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'LEDGER-1');
    DECLARE @IDMovement BIGINT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @IDAdmin, @IDVariant = @IDVariant, @Quantity = 5, @Reason = N'Delivery', @IDMovement = @IDMovement OUTPUT;
    UPDATE dbo.Variants SET ReservedStock = 2 WHERE IDVariant = @IDVariant;

    DECLARE @Issue NVARCHAR(30) = (SELECT Issue FROM dbo.VW_Inventory_Reconciliation WHERE SKU = N'LEDGER-1');
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.VW_Inventory_Reconciliation WHERE SKU = N'LEDGER-1');
    EXEC tSQLt.AssertEqualsString @Expected = N'ReservedVsReservations', @Actual = @Issue;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
END;
GO
