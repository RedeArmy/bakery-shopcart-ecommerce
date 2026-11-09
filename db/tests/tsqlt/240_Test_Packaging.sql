/* =====================================================================
   Objeto   : Test_Packaging (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Empaques que comparten una existencia en unidades: paquetes disponibles y sobrantes, reserva, venta, cancelación y devolución
   Autor    : Equipo ShopCart   Fecha: 2026-11-09
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). Todas las variantes anteriores a V0019 traen una unidad
              y guardan su propia existencia, así que el resto de las pruebas no cambia.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Packaging';
GO

-- Unas champurradas con tres empaques: la pieza (que guarda la existencia), la bolsa de 6 y la docena. Entran 54 unidades por el
-- libro de inventario, indicando la bolsa: la entrada es de unidades y va a la existencia compartida.
CREATE PROCEDURE Test_Packaging.SetUp
AS
BEGIN
    EXEC Test_Lifecycle.SetUp;

    IF NOT EXISTS (SELECT 1 FROM dbo.InventoryMovementTypes WHERE IDInventoryMovementType = 1) INSERT INTO dbo.InventoryMovementTypes VALUES (1, N'Entry');
    IF NOT EXISTS (SELECT 1 FROM dbo.InventoryMovementTypes WHERE IDInventoryMovementType = 3) INSERT INTO dbo.InventoryMovementTypes VALUES (3, N'Adjustment');
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 2) INSERT INTO dbo.Roles (IDRole, Name) VALUES (2, N'Operator');

    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Category INT = Test_Shop.CategoryId(N'Cookies');
    DECLARE @IDProduct INT, @Unit INT, @Bag INT, @Dozen INT, @Movement BIGINT;
    EXEC dbo.SP_Products_Create @IDActor = @Admin, @IDCategory = @Category, @Name = N'Champurradas', @IDProduct = @IDProduct OUTPUT;
    EXEC dbo.SP_Variants_Create @IDActor = @Admin, @IDProduct = @IDProduct, @SKU = N'CHAMP-UNIT', @Price = 3.00, @IDVariant = @Unit OUTPUT;
    EXEC dbo.SP_Variants_Create @IDActor = @Admin, @IDProduct = @IDProduct, @SKU = N'CHAMP-BAG6', @Price = 16.00,
         @UnitsPerPack = 6, @IDStockVariant = @Unit, @IDVariant = @Bag OUTPUT;
    EXEC dbo.SP_Variants_Create @IDActor = @Admin, @IDProduct = @IDProduct, @SKU = N'CHAMP-DOZEN', @Price = 30.00,
         @UnitsPerPack = 12, @IDStockVariant = @Unit, @IDVariant = @Dozen OUTPUT;
    EXEC dbo.SP_Inventory_RegisterEntry @IDActor = @Admin, @IDVariant = @Bag, @Quantity = 54, @Reason = N'Opening count', @IDMovement = @Movement OUTPUT;
END;
GO

-- Ayudas ------------------------------------------------------------------------------------

CREATE FUNCTION Test_Packaging.OnHand (@SKU NVARCHAR(40)) RETURNS INT
AS
BEGIN
    RETURN (SELECT OnHandStock FROM dbo.Variants WHERE SKU = @SKU);
END;
GO

CREATE FUNCTION Test_Packaging.Reserved (@SKU NVARCHAR(40)) RETURNS INT
AS
BEGIN
    RETURN (SELECT ReservedStock FROM dbo.Variants WHERE SKU = @SKU);
END;
GO

-- Lo que la ficha del producto dice de una variante: paquetes, paquetes disponibles y unidades sueltas
CREATE PROCEDURE Test_Packaging.Detail
    @SKU NVARCHAR(40), @Packs INT OUTPUT, @Available INT OUTPUT, @Loose INT OUTPUT, @Units INT OUTPUT, @PerPack INT OUTPUT
AS
BEGIN
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Champurradas');
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, RowVer BINARY(8), Images NVARCHAR(MAX), Variants NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Products_Get @IDProduct = @IDProduct, @IncludeInactive = 1;
    DECLARE @Variants NVARCHAR(MAX) = (SELECT Variants FROM #Result);
    SELECT @Packs = CAST(JSON_VALUE(j.value, '$.OnHandPacks') AS INT),
           @Available = CAST(JSON_VALUE(j.value, '$.Available') AS INT),
           @Loose = CAST(JSON_VALUE(j.value, '$.LooseUnits') AS INT),
           @Units = CAST(JSON_VALUE(j.value, '$.OnHandStock') AS INT),
           @PerPack = CAST(JSON_VALUE(j.value, '$.UnitsPerPack') AS INT)
    FROM OPENJSON(@Variants) AS j
    WHERE JSON_VALUE(j.value, '$.SKU') = @SKU;
END;
GO

-- Alta de empaques ---------------------------------------------------------------------------

CREATE PROCEDURE Test_Packaging.[test a packaging draws from the stock of the variant that holds it and keeps none of its own]
AS
BEGIN
    DECLARE @Unit INT = Test_Shop.VariantId(N'CHAMP-UNIT'), @Bag INT = Test_Shop.VariantId(N'CHAMP-BAG6'), @Dozen INT = Test_Shop.VariantId(N'CHAMP-DOZEN');
    DECLARE @BagHolder INT = (SELECT IDStockHolder FROM dbo.Variants WHERE IDVariant = @Bag);
    DECLARE @DozenHolder INT = (SELECT IDStockHolder FROM dbo.Variants WHERE IDVariant = @Dozen);
    DECLARE @UnitHolder INT = (SELECT IDStockHolder FROM dbo.Variants WHERE IDVariant = @Unit);
    DECLARE @BagUnits INT = (SELECT UnitsPerPack FROM dbo.Variants WHERE IDVariant = @Bag);
    DECLARE @DozenUnits INT = (SELECT UnitsPerPack FROM dbo.Variants WHERE IDVariant = @Dozen);
    DECLARE @UnitUnits INT = (SELECT UnitsPerPack FROM dbo.Variants WHERE IDVariant = @Unit);
    DECLARE @BagOwn INT = Test_Packaging.OnHand(N'CHAMP-BAG6');

    EXEC tSQLt.AssertEquals @Expected = @Unit, @Actual = @BagHolder;
    EXEC tSQLt.AssertEquals @Expected = @Unit, @Actual = @DozenHolder;
    EXEC tSQLt.AssertEquals @Expected = @Unit, @Actual = @UnitHolder;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @BagUnits;
    EXEC tSQLt.AssertEquals @Expected = 12, @Actual = @DozenUnits;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @UnitUnits;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @BagOwn;
END;
GO

CREATE PROCEDURE Test_Packaging.[test a packaging cannot draw from a variant of another product]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Other INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Champurradas'), @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%same product that holds its own stock%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Variants_Create @IDActor = @Admin, @IDProduct = @IDProduct, @SKU = N'CHAMP-BAD', @Price = 5.00,
         @UnitsPerPack = 6, @IDStockVariant = @Other, @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Packaging.[test a packaging cannot draw from a variant that itself draws from another]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Bag INT = Test_Shop.VariantId(N'CHAMP-BAG6');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Champurradas'), @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%same product that holds its own stock%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Variants_Create @IDActor = @Admin, @IDProduct = @IDProduct, @SKU = N'CHAMP-BAD', @Price = 5.00,
         @UnitsPerPack = 3, @IDStockVariant = @Bag, @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Packaging.[test the units of a packaging are between 1 and 1000]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Champurradas'), @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UnitsPerPack must be between 1 and 1000%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Variants_Create @IDActor = @Admin, @IDProduct = @IDProduct, @SKU = N'CHAMP-BAD', @Price = 5.00,
         @UnitsPerPack = 0, @IDVariant = @IDVariant OUTPUT;
END;
GO

-- Existencia y libro ----------------------------------------------------------------------------

CREATE PROCEDURE Test_Packaging.[test an entry through a packaging adds units to the shared stock and the ledger belongs to the holder]
AS
BEGIN
    DECLARE @Unit INT = Test_Shop.VariantId(N'CHAMP-UNIT'), @Bag INT = Test_Shop.VariantId(N'CHAMP-BAG6');
    DECLARE @Shared INT = Test_Packaging.OnHand(N'CHAMP-UNIT');
    DECLARE @OnHolder INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDVariant = @Unit AND Quantity = 54 AND ResultingBalance = 54);
    DECLARE @OnBag INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDVariant = @Bag);

    CREATE TABLE #Ledger (IDInventoryMovement BIGINT, MovementType NVARCHAR(30), Quantity INT, ResultingBalance INT, Reason NVARCHAR(250),
                          IDUser INT, UserName NVARCHAR(120), IDOrder INT, CreatedAt DATETIME2(3), TotalCount INT);
    -- El libro se lee por cualquiera de los empaques y es el mismo
    INSERT INTO #Ledger EXEC dbo.SP_Inventory_GetLedger @IDVariant = @Bag;
    DECLARE @FromBag INT = (SELECT COUNT(*) FROM #Ledger WHERE Quantity = 54);

    EXEC tSQLt.AssertEquals @Expected = 54, @Actual = @Shared;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OnHolder;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OnBag;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @FromBag;
END;
GO

CREATE PROCEDURE Test_Packaging.[test the counting adjusts the units of the shared stock whichever packaging is named]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Dozen INT = Test_Shop.VariantId(N'CHAMP-DOZEN'), @Movement BIGINT;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @Admin, @IDVariant = @Dozen, @NewOnHand = 50, @Reason = N'Monday count', @IDMovement = @Movement OUTPUT;

    DECLARE @Shared INT = Test_Packaging.OnHand(N'CHAMP-UNIT');
    DECLARE @Delta INT = (SELECT Quantity FROM dbo.InventoryMovements WHERE IDInventoryMovement = @Movement);
    EXEC tSQLt.AssertEquals @Expected = 50, @Actual = @Shared;
    EXEC tSQLt.AssertEquals @Expected = -4, @Actual = @Delta;
END;
GO

-- Paquetes y sobrantes -------------------------------------------------------------------------

CREATE PROCEDURE Test_Packaging.[test 54 units are 9 bags of 6 and 4 dozens with 6 units left over]
AS
BEGIN
    DECLARE @Packs INT, @Available INT, @Loose INT, @Units INT, @PerPack INT;
    EXEC Test_Packaging.Detail @SKU = N'CHAMP-BAG6', @Packs = @Packs OUTPUT, @Available = @Available OUTPUT, @Loose = @Loose OUTPUT, @Units = @Units OUTPUT, @PerPack = @PerPack OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 9, @Actual = @Packs;
    EXEC tSQLt.AssertEquals @Expected = 9, @Actual = @Available;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Loose;
    EXEC tSQLt.AssertEquals @Expected = 54, @Actual = @Units;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @PerPack;

    EXEC Test_Packaging.Detail @SKU = N'CHAMP-DOZEN', @Packs = @Packs OUTPUT, @Available = @Available OUTPUT, @Loose = @Loose OUTPUT, @Units = @Units OUTPUT, @PerPack = @PerPack OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Packs;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Available;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @Loose;
END;
GO

CREATE PROCEDURE Test_Packaging.[test 50 units are 8 bags of 6 because the rest is not a whole pack]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Unit INT = Test_Shop.VariantId(N'CHAMP-UNIT'), @Movement BIGINT;
    EXEC dbo.SP_Inventory_AdjustStock @IDActor = @Admin, @IDVariant = @Unit, @NewOnHand = 50, @Reason = N'Count', @IDMovement = @Movement OUTPUT;

    DECLARE @Packs INT, @Available INT, @Loose INT, @Units INT, @PerPack INT;
    EXEC Test_Packaging.Detail @SKU = N'CHAMP-BAG6', @Packs = @Packs OUTPUT, @Available = @Available OUTPUT, @Loose = @Loose OUTPUT, @Units = @Units OUTPUT, @PerPack = @PerPack OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @Packs;
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @Available;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Loose;

    EXEC Test_Packaging.Detail @SKU = N'CHAMP-UNIT', @Packs = @Packs OUTPUT, @Available = @Available OUTPUT, @Loose = @Loose OUTPUT, @Units = @Units OUTPUT, @PerPack = @PerPack OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 50, @Actual = @Packs;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Loose;
END;
GO

CREATE PROCEDURE Test_Packaging.[test the units reserved by a cart reduce the packs shown for every packaging]
AS
BEGIN
    DECLARE @IDReservation INT;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-DOZEN', @Quantity = 2;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    -- 54 - 24 = 30 libres: 5 bolsas de 6 y 2 docenas
    DECLARE @Packs INT, @Available INT, @Loose INT, @Units INT, @PerPack INT;
    EXEC Test_Packaging.Detail @SKU = N'CHAMP-BAG6', @Packs = @Packs OUTPUT, @Available = @Available OUTPUT, @Loose = @Loose OUTPUT, @Units = @Units OUTPUT, @PerPack = @PerPack OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 9, @Actual = @Packs;       -- lo que hay en el almacén no cambia
    EXEC tSQLt.AssertEquals @Expected = 5, @Actual = @Available;   -- lo que se puede comprar sí
    EXEC Test_Packaging.Detail @SKU = N'CHAMP-DOZEN', @Packs = @Packs OUTPUT, @Available = @Available OUTPUT, @Loose = @Loose OUTPUT, @Units = @Units OUTPUT, @PerPack = @PerPack OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Available;
END;
GO

-- Carrito -------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Packaging.[test a cart can hold as many bags as the units allow]
AS
BEGIN
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 9;
    DECLARE @Quantity INT = (SELECT ci.Quantity FROM dbo.CartItems AS ci WHERE ci.IDVariant = Test_Shop.VariantId(N'CHAMP-BAG6'));
    EXEC tSQLt.AssertEquals @Expected = 9, @Actual = @Quantity;
END;
GO

CREATE PROCEDURE Test_Packaging.[test a cart cannot hold more bags than the units allow]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INSUFFICIENT_STOCK: Only 9 units are available.', @ExpectedErrorNumber = 50409;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 10;
END;
GO

CREATE PROCEDURE Test_Packaging.[test the availability of a cart counts what the cart itself already holds in units]
AS
BEGIN
    DECLARE @IDReservation INT;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 3;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    DECLARE @Dozen INT = Test_Shop.VariantId(N'CHAMP-DOZEN');
    -- Ana reservó 18 de 54: para ella siguen siendo 4 docenas; para otra persona, 36 unidades, o sea 3
    DECLARE @ForAna INT = (SELECT Available FROM dbo.FU_Cart_AvailableStock(Test_Shop.CartIdOf(N'ana@shopcart.test'), @Dozen));
    DECLARE @ForOthers INT = (SELECT Available FROM dbo.FU_Cart_AvailableStock(NULL, @Dozen));
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @ForAna;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @ForOthers;
END;
GO

-- Reserva -------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Packaging.[test reserving bags and dozens of the same product adds their units on the shared stock]
AS
BEGIN
    DECLARE @IDReservation INT;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 3;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-DOZEN', @Quantity = 3;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    -- 3 × 6 + 3 × 12 = 54: justo lo que hay
    DECLARE @Reserved INT = Test_Packaging.Reserved(N'CHAMP-UNIT');
    DECLARE @BagReserved INT = Test_Packaging.Reserved(N'CHAMP-BAG6');
    EXEC tSQLt.AssertEquals @Expected = 54, @Actual = @Reserved;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @BagReserved;
END;
GO

CREATE PROCEDURE Test_Packaging.[test lines that are fine alone but exceed the units together are refused]
AS
BEGIN
    -- 3 bolsas (18) y 4 docenas (48): cada una cabe sola, juntas son 66 de 54
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 3;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-DOZEN', @Quantity = 4;
    DECLARE @IDReservation INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%no longer available%', @ExpectedErrorNumber = 50409;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
END;
GO

CREATE PROCEDURE Test_Packaging.[test releasing the reservation gives the units back to the shared stock]
AS
BEGIN
    DECLARE @IDReservation INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 2;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    DECLARE @Held INT = Test_Packaging.Reserved(N'CHAMP-UNIT');

    DECLARE @IDCart INT = Test_Shop.CartIdOf(N'ana@shopcart.test');
    EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @Ana, @IDCart = @IDCart;

    DECLARE @Released INT = Test_Packaging.Reserved(N'CHAMP-UNIT');
    EXEC tSQLt.AssertEquals @Expected = 12, @Actual = @Held;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Released;
END;
GO

CREATE PROCEDURE Test_Packaging.[test an expired reservation gives the units back to the shared stock]
AS
BEGIN
    DECLARE @IDReservation INT, @Released INT;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-DOZEN', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    DECLARE @Held INT = Test_Packaging.Reserved(N'CHAMP-UNIT');

    EXEC dbo.SP_Inventory_ReleaseExpiredReservations @Now = '2031-01-01T00:00:00', @Released = @Released OUTPUT;

    DECLARE @After INT = Test_Packaging.Reserved(N'CHAMP-UNIT');
    EXEC tSQLt.AssertEquals @Expected = 12, @Actual = @Held;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @After;
END;
GO

CREATE PROCEDURE Test_Packaging.[test the packagings still sell after the variant that holds the stock stops being sold]
AS
BEGIN
    -- Dejar de vender la pieza no toca la existencia: la guarda ella aunque esté desactivada
    UPDATE dbo.Variants SET IsActive = 0 WHERE SKU = N'CHAMP-UNIT';
    DECLARE @IDReservation INT;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 2;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    DECLARE @Reserved INT = Test_Packaging.Reserved(N'CHAMP-UNIT');
    DECLARE @Shared INT = Test_Packaging.OnHand(N'CHAMP-UNIT');
    EXEC tSQLt.AssertEquals @Expected = 12, @Actual = @Reserved;
    EXEC tSQLt.AssertEquals @Expected = 54, @Actual = @Shared;
END;
GO

CREATE PROCEDURE Test_Packaging.[test an inactive packaging is not reserved even if the units are there]
AS
BEGIN
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'CHAMP-DOZEN', @Quantity = 1;
    UPDATE dbo.Variants SET IsActive = 0 WHERE SKU = N'CHAMP-DOZEN';
    DECLARE @IDReservation INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%no longer available%', @ExpectedErrorNumber = 50409;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
END;
GO

-- Catálogo -------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Packaging.[test the catalogue offers the most packs of an active packaging, not the sum of them]
AS
BEGIN
    UPDATE dbo.Variants SET IsActive = 0 WHERE SKU = N'CHAMP-UNIT';
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000), LeadTimeDays TINYINT,
                          IsActive BIT, PrimaryImageUrl NVARCHAR(500), MinPrice VARCHAR(20), MaxPrice VARCHAR(20), Available INT, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Products_Search @Query = N'Champurradas';

    -- Con la pieza fuera de venta quedan la bolsa (9) y la docena (4): se ofrecen 9, no 13
    DECLARE @Available INT = (SELECT Available FROM #Result WHERE Name = N'Champurradas');
    EXEC tSQLt.AssertEquals @Expected = 9, @Actual = @Available;
END;
GO

CREATE PROCEDURE Test_Packaging.[test the availability view shows the shared stock and the packs of each variant]
AS
BEGIN
    DECLARE @Packs INT = (SELECT AvailablePacks FROM dbo.VW_Inventory_Availability WHERE SKU = N'CHAMP-DOZEN');
    DECLARE @Units INT = (SELECT AvailableStock FROM dbo.VW_Inventory_Availability WHERE SKU = N'CHAMP-DOZEN');
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Packs;
    EXEC tSQLt.AssertEquals @Expected = 54, @Actual = @Units;
END;
GO

-- Venta, cancelación y devolución ----------------------------------------------------------------

CREATE PROCEDURE Test_Packaging.[test a paid order takes the units of its packs out of the shared stock and writes the exit in units]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Unit INT = Test_Shop.VariantId(N'CHAMP-UNIT');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 2, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    DECLARE @OnHand INT = Test_Packaging.OnHand(N'CHAMP-UNIT');
    DECLARE @Reserved INT = Test_Packaging.Reserved(N'CHAMP-UNIT');
    DECLARE @Exit INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDVariant = @Unit AND IDInventoryMovementType = 2 AND Quantity = -12 AND ResultingBalance = 42);
    DECLARE @OnBag INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDVariant = Test_Shop.VariantId(N'CHAMP-BAG6'));
    DECLARE @LineQuantity INT = (SELECT Quantity FROM dbo.OrderLines WHERE IDOrder = @IDOrder);

    EXEC tSQLt.AssertEquals @Expected = 42, @Actual = @OnHand;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Reserved;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Exit;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OnBag;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @LineQuantity;   -- el pedido cuenta paquetes, no unidades
END;
GO

CREATE PROCEDURE Test_Packaging.[test cancelling a paid order puts the units of its packs back]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Unit INT = Test_Shop.VariantId(N'CHAMP-UNIT');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'CHAMP-DOZEN', @Quantity = 2, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @Sold INT = Test_Packaging.OnHand(N'CHAMP-UNIT');

    EXEC dbo.SP_Orders_Cancel @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Customer asked';

    DECLARE @Restored INT = Test_Packaging.OnHand(N'CHAMP-UNIT');
    DECLARE @Entry INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDVariant = @Unit AND IDInventoryMovementType = 4 AND Quantity = 24 AND ResultingBalance = 54);
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Sold;
    EXEC tSQLt.AssertEquals @Expected = 54, @Actual = @Restored;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Entry;
END;
GO

CREATE PROCEDURE Test_Packaging.[test returning one bag puts 6 units back]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Unit INT = Test_Shop.VariantId(N'CHAMP-UNIT');
    DECLARE @IDReturn INT, @IDRefund INT, @Amount DECIMAL(18,2);
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @IDLine INT = Test_Lifecycle.LineOf(@IDOrder, N'CHAMP-BAG6'), @Lines NVARCHAR(200);
    SET @Lines = Test_Lifecycle.Lines(@IDLine, 1);
    DECLARE @Sold INT = Test_Packaging.OnHand(N'CHAMP-UNIT');

    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Crushed bag', @Lines = @Lines,
         @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;

    DECLARE @Restored INT = Test_Packaging.OnHand(N'CHAMP-UNIT');
    DECLARE @Entry INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDVariant = @Unit AND IDInventoryMovementType = 4 AND Quantity = 6 AND ResultingBalance = 42);
    EXEC tSQLt.AssertEquals @Expected = 36, @Actual = @Sold;
    EXEC tSQLt.AssertEquals @Expected = 42, @Actual = @Restored;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Entry;
END;
GO

CREATE PROCEDURE Test_Packaging.[test the reconciliation finds nothing after reserving and selling packs]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'CHAMP-DOZEN', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @IDReservation INT;
    EXEC Test_Orders.AddLine @Email = N'luis@shopcart.test', @SKU = N'CHAMP-BAG6', @Quantity = 2;
    EXEC Test_Orders.Reserve @Email = N'luis@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    -- Las variantes del ejemplo se cargaron sin libro; solo importan las champurradas
    DECLARE @Issues INT = (SELECT COUNT(*) FROM dbo.VW_Inventory_Reconciliation WHERE SKU LIKE N'CHAMP-%');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Issues;
END;
GO
