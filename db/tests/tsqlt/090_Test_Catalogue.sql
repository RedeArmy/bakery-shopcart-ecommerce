/* =====================================================================
   Objeto   : Test_Catalogue (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Categorías, productos y variantes: reglas, permisos, bitácora y búsqueda
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Catalogue';
GO

-- Un administrador y un cliente; "Cakes" con la hija "Wedding cakes"; un pastel con dos variantes (5 y 0 disponibles)
-- y un pastel de bodas con una variante (2 disponibles). Se insertan filas directas, no con los procedimientos, para
-- que las pruebas de cada procedimiento no dependan de los demás.
CREATE PROCEDURE Test_Catalogue.SetUp
AS
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 1) INSERT INTO dbo.Roles (IDRole, Name) VALUES (1, N'Customer');
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 3) INSERT INTO dbo.Roles (IDRole, Name) VALUES (3, N'Administrator');

    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (3, N'admin@shopcart.test', N'not-a-real-hash', N'Test Admin'),
           (1, N'customer@shopcart.test', N'not-a-real-hash', N'Test Customer');

    INSERT INTO dbo.Categories (Name) VALUES (N'Cakes');
    INSERT INTO dbo.Categories (Name, IDParentCategory) SELECT N'Wedding cakes', IDCategory FROM dbo.Categories WHERE Name = N'Cakes';

    INSERT INTO dbo.Products (IDCategory, Name, Description, LeadTimeDays)
    SELECT IDCategory, N'Chocolate cake', N'Moist chocolate sponge', 1 FROM dbo.Categories WHERE Name = N'Cakes';
    INSERT INTO dbo.Products (IDCategory, Name, Description, LeadTimeDays)
    SELECT IDCategory, N'Wedding tier', N'Three tiers', 7 FROM dbo.Categories WHERE Name = N'Wedding cakes';

    INSERT INTO dbo.Variants (IDProduct, SKU, Price, OnHandStock)
    SELECT IDProduct, N'CAKE-S', 100.00, 5 FROM dbo.Products WHERE Name = N'Chocolate cake';
    INSERT INTO dbo.Variants (IDProduct, SKU, Price, OnHandStock)
    SELECT IDProduct, N'CAKE-L', 200.00, 0 FROM dbo.Products WHERE Name = N'Chocolate cake';
    INSERT INTO dbo.Variants (IDProduct, SKU, Price, OnHandStock)
    SELECT IDProduct, N'WED-1', 500.00, 2 FROM dbo.Products WHERE Name = N'Wedding tier';

    INSERT INTO dbo.ProductImages (IDProduct, Url, SortOrder, IsPrimary)
    SELECT IDProduct, N'/img/cake-2.jpg', 2, 0 FROM dbo.Products WHERE Name = N'Chocolate cake';
    INSERT INTO dbo.ProductImages (IDProduct, Url, SortOrder, IsPrimary)
    SELECT IDProduct, N'/img/cake-1.jpg', 1, 1 FROM dbo.Products WHERE Name = N'Chocolate cake';
END;
GO

-- Categorías --------------------------------------------------------------------------------

CREATE PROCEDURE Test_Catalogue.[test creating a category stores it trimmed and leaves an audit entry]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT;
    EXEC dbo.SP_Categories_Create @IDActor = @IDAdmin, @Name = N'  Cupcakes ', @IDCategory = @IDCategory OUTPUT;

    DECLARE @Name NVARCHAR(80) = (SELECT Name FROM dbo.Categories WHERE IDCategory = @IDCategory);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Categories' AND Action = N'Create'
                          AND EntityKey = CAST(@IDCategory AS NVARCHAR(40)) AND IDUser = @IDAdmin);
    EXEC tSQLt.AssertEqualsString @Expected = N'Cupcakes', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a category can be created under an active parent]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDParent INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDCategory INT;
    EXEC dbo.SP_Categories_Create @IDActor = @IDAdmin, @Name = N'Birthday cakes', @IDParentCategory = @IDParent, @IDCategory = @IDCategory OUTPUT;

    DECLARE @Linked INT = (SELECT COUNT(*) FROM dbo.Categories WHERE IDCategory = @IDCategory AND IDParentCategory = @IDParent);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Linked;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a category name is unique whatever its case]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%already exists%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Categories_Create @IDActor = @IDAdmin, @Name = N'CAKES', @IDCategory = @IDCategory OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a customer cannot create a category]
AS
BEGIN
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDCategory INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Categories_Create @IDActor = @IDCustomer, @Name = N'Pies', @IDCategory = @IDCategory OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a category under an unknown parent answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Parent category not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Categories_Create @IDActor = @IDAdmin, @Name = N'Pies', @IDParentCategory = -1, @IDCategory = @IDCategory OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a category without a name is rejected]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Categories_Create @IDActor = @IDAdmin, @Name = N'   ', @IDCategory = @IDCategory OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test updating a category records the previous and the new values]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Wedding cakes');

    EXEC dbo.SP_Categories_Update @IDActor = @IDAdmin, @IDCategory = @IDCategory, @Name = N'Bridal cakes', @Description = N'For weddings';

    DECLARE @Previous NVARCHAR(MAX) = (SELECT PreviousValue FROM dbo.AuditLog WHERE Module = N'Categories' AND Action = N'Update');
    DECLARE @New NVARCHAR(MAX) = (SELECT NewValue FROM dbo.AuditLog WHERE Module = N'Categories' AND Action = N'Update');
    DECLARE @PreviousName NVARCHAR(80) = JSON_VALUE(@Previous, '$.Name');
    DECLARE @NewName NVARCHAR(80) = JSON_VALUE(@New, '$.Name');
    EXEC tSQLt.AssertEqualsString @Expected = N'Wedding cakes', @Actual = @PreviousName;
    EXEC tSQLt.AssertEqualsString @Expected = N'Bridal cakes', @Actual = @NewName;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test saving a category with the same data leaves no audit entry]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');

    EXEC dbo.SP_Categories_Update @IDActor = @IDAdmin, @IDCategory = @IDCategory, @Name = N'Cakes';

    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Categories');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Audit;
END;
GO

-- Un árbol sin ciclos: ni la propia categoría ni una descendiente puede ser su padre
CREATE PROCEDURE Test_Catalogue.[test a category cannot become a child of its own descendant]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCakes INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDWedding INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Wedding cakes');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%own ancestor%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Categories_Update @IDActor = @IDAdmin, @IDCategory = @IDCakes, @Name = N'Cakes', @IDParentCategory = @IDWedding;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a category cannot be its own parent]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCakes INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%own ancestor%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Categories_Update @IDActor = @IDAdmin, @IDCategory = @IDCakes, @Name = N'Cakes', @IDParentCategory = @IDCakes;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test renaming a category to an existing name is a conflict]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDWedding INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Wedding cakes');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%already exists%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Categories_Update @IDActor = @IDAdmin, @IDCategory = @IDWedding, @Name = N'cakes';
END;
GO

CREATE PROCEDURE Test_Catalogue.[test updating an unknown category answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Category not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Categories_Update @IDActor = @IDAdmin, @IDCategory = -1, @Name = N'Whatever';
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a category with active products cannot be deactivated]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDWedding INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Wedding cakes');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%still has active%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Categories_Deactivate @IDActor = @IDAdmin, @IDCategory = @IDWedding;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a category with active subcategories cannot be deactivated]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCakes INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    UPDATE dbo.Products SET IsActive = 0;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%still has active%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Categories_Deactivate @IDActor = @IDAdmin, @IDCategory = @IDCakes;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test an empty category is deactivated once and the repeat is harmless]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT;
    EXEC dbo.SP_Categories_Create @IDActor = @IDAdmin, @Name = N'Seasonal', @IDCategory = @IDCategory OUTPUT;

    EXEC dbo.SP_Categories_Deactivate @IDActor = @IDAdmin, @IDCategory = @IDCategory;
    EXEC dbo.SP_Categories_Deactivate @IDActor = @IDAdmin, @IDCategory = @IDCategory;

    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Categories WHERE IDCategory = @IDCategory);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Categories' AND Action = N'Deactivate');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test the category list hides inactive categories and counts active products]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT;
    EXEC dbo.SP_Categories_Create @IDActor = @IDAdmin, @Name = N'Seasonal', @IDCategory = @IDCategory OUTPUT;
    EXEC dbo.SP_Categories_Deactivate @IDActor = @IDAdmin, @IDCategory = @IDCategory;

    CREATE TABLE #Result (IDCategory INT, IDParentCategory INT, Name NVARCHAR(80), Description NVARCHAR(300), IsActive BIT, ActiveProducts INT);
    INSERT INTO #Result EXEC dbo.SP_Categories_List;
    DECLARE @Visible INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Products INT = (SELECT ActiveProducts FROM #Result WHERE Name = N'Cakes');
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Categories_List @IncludeInactive = 1;
    DECLARE @All INT = (SELECT COUNT(*) FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Visible;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Products;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @All;
END;
GO

-- Productos ---------------------------------------------------------------------------------

CREATE PROCEDURE Test_Catalogue.[test creating a product stores it and leaves an audit entry]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDProduct INT;
    EXEC dbo.SP_Products_Create @IDActor = @IDAdmin, @IDCategory = @IDCategory, @Name = N' Fruit tart ', @LeadTimeDays = 2, @IDProduct = @IDProduct OUTPUT;

    DECLARE @Name NVARCHAR(150) = (SELECT Name FROM dbo.Products WHERE IDProduct = @IDProduct);
    DECLARE @Lead INT = (SELECT LeadTimeDays FROM dbo.Products WHERE IDProduct = @IDProduct);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Products' AND EntityName = N'Product' AND Action = N'Create'
                          AND EntityKey = CAST(@IDProduct AS NVARCHAR(40)));
    EXEC tSQLt.AssertEqualsString @Expected = N'Fruit tart', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Lead;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a product cannot go into an inactive category]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDProduct INT;
    UPDATE dbo.Categories SET IsActive = 0 WHERE IDCategory = @IDCategory;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Category not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Products_Create @IDActor = @IDAdmin, @IDCategory = @IDCategory, @Name = N'Flan', @IDProduct = @IDProduct OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a customer cannot create a product]
AS
BEGIN
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDProduct INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Products_Create @IDActor = @IDCustomer, @IDCategory = @IDCategory, @Name = N'Flan', @IDProduct = @IDProduct OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a product without a name is rejected]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDProduct INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Products_Create @IDActor = @IDAdmin, @IDCategory = @IDCategory, @Name = N'', @IDProduct = @IDProduct OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test updating a product changes it and records the change]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');

    EXEC dbo.SP_Products_Update @IDActor = @IDAdmin, @IDProduct = @IDProduct, @IDCategory = @IDCategory, @Name = N'Dark chocolate cake', @LeadTimeDays = 3;

    DECLARE @Name NVARCHAR(150) = (SELECT Name FROM dbo.Products WHERE IDProduct = @IDProduct);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Products' AND Action = N'Update' AND EntityKey = CAST(@IDProduct AS NVARCHAR(40)));
    EXEC tSQLt.AssertEqualsString @Expected = N'Dark chocolate cake', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test an edit based on an outdated row version is a conflict]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @Stale BINARY(8) = (SELECT CAST(RowVer AS BINARY(8)) FROM dbo.Products WHERE IDProduct = @IDProduct);
    UPDATE dbo.Products SET Description = N'Changed by someone else' WHERE IDProduct = @IDProduct;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%modified by someone else%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Products_Update @IDActor = @IDAdmin, @IDProduct = @IDProduct, @IDCategory = @IDCategory, @Name = N'Chocolate cake',
         @LeadTimeDays = 1, @RowVer = @Stale;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test an edit based on the current row version succeeds]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @Current BINARY(8) = (SELECT CAST(RowVer AS BINARY(8)) FROM dbo.Products WHERE IDProduct = @IDProduct);

    EXEC dbo.SP_Products_Update @IDActor = @IDAdmin, @IDProduct = @IDProduct, @IDCategory = @IDCategory, @Name = N'Chocolate gateau',
         @LeadTimeDays = 1, @RowVer = @Current;

    DECLARE @Name NVARCHAR(150) = (SELECT Name FROM dbo.Products WHERE IDProduct = @IDProduct);
    EXEC tSQLt.AssertEqualsString @Expected = N'Chocolate gateau', @Actual = @Name;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test updating an unknown product answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCategory INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Product not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Products_Update @IDActor = @IDAdmin, @IDProduct = -1, @IDCategory = @IDCategory, @Name = N'Whatever', @LeadTimeDays = 0;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test deactivating a product also deactivates its variants]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');

    EXEC dbo.SP_Products_Deactivate @IDActor = @IDAdmin, @IDProduct = @IDProduct;
    EXEC dbo.SP_Products_Deactivate @IDActor = @IDAdmin, @IDProduct = @IDProduct;

    DECLARE @ActiveVariants INT = (SELECT COUNT(*) FROM dbo.Variants WHERE IDProduct = @IDProduct AND IsActive = 1);
    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Products WHERE IDProduct = @IDProduct);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Products' AND Action = N'Deactivate');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ActiveVariants;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

-- Un producto desactivado ya no puede reservarse: la reserva solo mira la variante
CREATE PROCEDURE Test_Catalogue.[test a deactivated product can no longer be reserved]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-S');
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@IDCustomer, N'Active');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDCustomer);
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity) VALUES (@IDCart, @IDVariant, 1);
    IF NOT EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'ReservationMinutes')
        INSERT INTO dbo.Configuration (SettingKey, SettingValue) VALUES (N'ReservationMinutes', N'15');
    EXEC dbo.SP_Products_Deactivate @IDActor = @IDAdmin, @IDProduct = @IDProduct;

    DECLARE @IDReservation INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%no longer available%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDCustomer, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a product sheet carries images variants prices as text and availability]
AS
BEGIN
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, RowVer BINARY(8), Images NVARCHAR(MAX), Variants NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Products_Get @IDProduct = @IDProduct;

    DECLARE @Images NVARCHAR(MAX) = (SELECT Images FROM #Result);
    DECLARE @Variants NVARCHAR(MAX) = (SELECT Variants FROM #Result);
    DECLARE @FirstImage NVARCHAR(500) = JSON_VALUE(@Images, '$[0].Url');
    DECLARE @VariantCount INT = (SELECT COUNT(*) FROM OPENJSON(@Variants));
    DECLARE @Price NVARCHAR(20) = JSON_VALUE(@Variants, '$[0].Price');
    DECLARE @Available INT = CAST(JSON_VALUE(@Variants, '$[0].Available') AS INT);
    DECLARE @Category NVARCHAR(80) = (SELECT CategoryName FROM #Result);

    EXEC tSQLt.AssertEqualsString @Expected = N'/img/cake-1.jpg', @Actual = @FirstImage;   -- la principal va primero
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @VariantCount;
    EXEC tSQLt.AssertEqualsString @Expected = N'100.00', @Actual = @Price;
    EXEC tSQLt.AssertEquals @Expected = 5, @Actual = @Available;
    EXEC tSQLt.AssertEqualsString @Expected = N'Cakes', @Actual = @Category;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a product sheet hides inactive variants unless asked]
AS
BEGIN
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    UPDATE dbo.Variants SET IsActive = 0 WHERE SKU = N'CAKE-L';
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, RowVer BINARY(8), Images NVARCHAR(MAX), Variants NVARCHAR(MAX));

    INSERT INTO #Result EXEC dbo.SP_Products_Get @IDProduct = @IDProduct;
    DECLARE @Public INT = (SELECT COUNT(*) FROM OPENJSON((SELECT Variants FROM #Result)));
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Products_Get @IDProduct = @IDProduct, @IncludeInactive = 1;
    DECLARE @Admin INT = (SELECT COUNT(*) FROM OPENJSON((SELECT Variants FROM #Result)));

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Public;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Admin;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test an inactive product answers not found to the public]
AS
BEGIN
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    UPDATE dbo.Products SET IsActive = 0 WHERE IDProduct = @IDProduct;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Product not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Products_Get @IDProduct = @IDProduct;
END;
GO

-- Búsqueda -----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Catalogue.[test searching by text finds the product and reports its price range and availability]
AS
BEGIN
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, PrimaryImageUrl NVARCHAR(500), MinPrice VARCHAR(20), MaxPrice VARCHAR(20),
                          Available INT, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Products_Search @Query = N'CHOCOLATE';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Min VARCHAR(20) = (SELECT MinPrice FROM #Result);
    DECLARE @Max VARCHAR(20) = (SELECT MaxPrice FROM #Result);
    DECLARE @Available INT = (SELECT Available FROM #Result);
    DECLARE @Image NVARCHAR(500) = (SELECT PrimaryImageUrl FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'100.00', @Actual = @Min;
    EXEC tSQLt.AssertEqualsString @Expected = N'200.00', @Actual = @Max;
    EXEC tSQLt.AssertEquals @Expected = 5, @Actual = @Available;
    EXEC tSQLt.AssertEqualsString @Expected = N'/img/cake-1.jpg', @Actual = @Image;
END;
GO

-- Quien filtra por "Cakes" espera ver también lo de "Wedding cakes"
CREATE PROCEDURE Test_Catalogue.[test filtering by a category includes its subcategories]
AS
BEGIN
    DECLARE @IDCakes INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Cakes');
    DECLARE @IDWedding INT = (SELECT IDCategory FROM dbo.Categories WHERE Name = N'Wedding cakes');
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, PrimaryImageUrl NVARCHAR(500), MinPrice VARCHAR(20), MaxPrice VARCHAR(20),
                          Available INT, TotalCount INT);

    INSERT INTO #Result EXEC dbo.SP_Products_Search @IDCategory = @IDCakes;
    DECLARE @Parent INT = (SELECT COUNT(*) FROM #Result);
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Products_Search @IDCategory = @IDWedding;
    DECLARE @Child INT = (SELECT COUNT(*) FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Parent;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Child;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test the price filter keeps products with a variant in range]
AS
BEGIN
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, PrimaryImageUrl NVARCHAR(500), MinPrice VARCHAR(20), MaxPrice VARCHAR(20),
                          Available INT, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Products_Search @MinPrice = 300.00;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Name NVARCHAR(150) = (SELECT Name FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'Wedding tier', @Actual = @Name;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test the in stock filter drops products with nothing available]
AS
BEGIN
    UPDATE dbo.Variants SET OnHandStock = 0 WHERE SKU = N'WED-1';
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, PrimaryImageUrl NVARCHAR(500), MinPrice VARCHAR(20), MaxPrice VARCHAR(20),
                          Available INT, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Products_Search @InStockOnly = 1;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Name NVARCHAR(150) = (SELECT Name FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'Chocolate cake', @Actual = @Name;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test sorting by price puts the dearest product first]
AS
BEGIN
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, PrimaryImageUrl NVARCHAR(500), MinPrice VARCHAR(20), MaxPrice VARCHAR(20),
                          Available INT, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Products_Search @SortBy = 'price_desc';
    DECLARE @First NVARCHAR(150) = (SELECT TOP (1) Name FROM #Result);
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Products_Search @SortBy = 'price_asc';
    DECLARE @Cheapest NVARCHAR(150) = (SELECT TOP (1) Name FROM #Result);

    EXEC tSQLt.AssertEqualsString @Expected = N'Wedding tier', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = N'Chocolate cake', @Actual = @Cheapest;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test the search hides inactive products and pages its rows]
AS
BEGIN
    UPDATE dbo.Products SET IsActive = 0 WHERE Name = N'Wedding tier';
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, PrimaryImageUrl NVARCHAR(500), MinPrice VARCHAR(20), MaxPrice VARCHAR(20),
                          Available INT, TotalCount INT);

    INSERT INTO #Result EXEC dbo.SP_Products_Search;
    DECLARE @Public INT = (SELECT COUNT(*) FROM #Result);
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Products_Search @IncludeInactive = 1, @PageNumber = 2, @PageSize = 1;
    DECLARE @Page INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Total INT = (SELECT MAX(TotalCount) FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Public;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Page;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a wildcard in the search text matches nothing]
AS
BEGIN
    CREATE TABLE #Result (IDProduct INT, IDCategory INT, CategoryName NVARCHAR(80), Name NVARCHAR(150), Description NVARCHAR(1000),
                          LeadTimeDays TINYINT, IsActive BIT, PrimaryImageUrl NVARCHAR(500), MinPrice VARCHAR(20), MaxPrice VARCHAR(20),
                          Available INT, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Products_Search @Query = N'%';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test an unknown sort order is rejected]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%SortBy%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Products_Search @SortBy = 'name; DROP TABLE dbo.Products';
END;
GO

CREATE PROCEDURE Test_Catalogue.[test an invalid page size is rejected by the search]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%PageSize%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Products_Search @PageSize = 0;
END;
GO

-- Variantes ---------------------------------------------------------------------------------

CREATE PROCEDURE Test_Catalogue.[test creating a variant starts it without stock and records the audit entry]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N' CAKE-XL ', @Price = 350.50,
         @Attributes = N'[{"name":"Size","value":"Extra large"}]', @IDVariant = @IDVariant OUTPUT;

    DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.Variants WHERE IDVariant = @IDVariant);
    DECLARE @SKU NVARCHAR(40) = (SELECT SKU FROM dbo.Variants WHERE IDVariant = @IDVariant);
    DECLARE @Attribute NVARCHAR(60) = (SELECT va.Value FROM dbo.VariantAttributes AS va JOIN dbo.Attributes AS a ON a.IDAttribute = va.IDAttribute
                                       WHERE va.IDVariant = @IDVariant AND a.Name = N'Size');
    DECLARE @NewValue NVARCHAR(MAX) = (SELECT NewValue FROM dbo.AuditLog WHERE Module = N'Products' AND EntityName = N'Variant' AND Action = N'Create'
                                       AND EntityKey = CAST(@IDVariant AS NVARCHAR(40)));
    DECLARE @AuditedPrice NVARCHAR(20) = JSON_VALUE(@NewValue, '$.Price');

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OnHand;
    EXEC tSQLt.AssertEqualsString @Expected = N'CAKE-XL', @Actual = @SKU;
    EXEC tSQLt.AssertEqualsString @Expected = N'Extra large', @Actual = @Attribute;
    EXEC tSQLt.AssertEqualsString @Expected = N'350.50', @Actual = @AuditedPrice;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a variant sku is unique whatever its case]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%SKU already exists%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'cake-s', @Price = 10.00, @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a variant needs a price above zero]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Price greater than zero%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'FREE', @Price = 0.00, @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a variant cannot be added to an inactive product]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    UPDATE dbo.Products SET IsActive = 0 WHERE IDProduct = @IDProduct;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%inactive product%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'LATE', @Price = 10.00, @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a variant of an unknown product answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Product not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = -1, @SKU = N'GHOST', @Price = 10.00, @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a customer cannot create a variant]
AS
BEGIN
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Variants_Create @IDActor = @IDCustomer, @IDProduct = @IDProduct, @SKU = N'HACK', @Price = 10.00, @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test attributes that are not a JSON array are rejected]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%JSON array%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'BAD-1', @Price = 10.00,
         @Attributes = N'{"name":"Size","value":"Large"}', @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a repeated attribute name is rejected]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%cannot be repeated%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'BAD-2', @Price = 10.00,
         @Attributes = N'[{"name":"Size","value":"S"},{"name":"size","value":"L"}]', @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test an attribute without a value is rejected]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%needs a name%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'BAD-3', @Price = 10.00,
         @Attributes = N'[{"name":"Size"}]', @IDVariant = @IDVariant OUTPUT;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test attribute names are shared between variants]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @First INT, @Second INT;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'SH-1', @Price = 10.00,
         @Attributes = N'[{"name":"Flavour","value":"Vanilla"}]', @IDVariant = @First OUTPUT;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'SH-2', @Price = 10.00,
         @Attributes = N'[{"name":"FLAVOUR","value":"Mocha"}]', @IDVariant = @Second OUTPUT;

    DECLARE @Names INT = (SELECT COUNT(*) FROM dbo.Attributes WHERE Name = N'Flavour');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Names;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test updating a variant changes its sku and state and records the change]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-L');

    EXEC dbo.SP_Variants_Update @IDActor = @IDAdmin, @IDVariant = @IDVariant, @SKU = N'CAKE-LARGE', @IsActive = 0;

    DECLARE @SKU NVARCHAR(40) = (SELECT SKU FROM dbo.Variants WHERE IDVariant = @IDVariant);
    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Variants WHERE IDVariant = @IDVariant);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Products' AND EntityName = N'Variant' AND Action = N'Update'
                          AND EntityKey = CAST(@IDVariant AS NVARCHAR(40)));
    EXEC tSQLt.AssertEqualsString @Expected = N'CAKE-LARGE', @Actual = @SKU;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

-- NULL deja los atributos intactos, [] los borra y una lista nueva los reemplaza
CREATE PROCEDURE Test_Catalogue.[test attributes are kept when null replaced by a list and cleared by an empty array]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT;
    EXEC dbo.SP_Variants_Create @IDActor = @IDAdmin, @IDProduct = @IDProduct, @SKU = N'ATT-1', @Price = 10.00,
         @Attributes = N'[{"name":"Size","value":"S"}]', @IDVariant = @IDVariant OUTPUT;

    EXEC dbo.SP_Variants_Update @IDActor = @IDAdmin, @IDVariant = @IDVariant, @SKU = N'ATT-1', @IsActive = 1, @Attributes = NULL;
    DECLARE @Kept INT = (SELECT COUNT(*) FROM dbo.VariantAttributes WHERE IDVariant = @IDVariant);

    EXEC dbo.SP_Variants_Update @IDActor = @IDAdmin, @IDVariant = @IDVariant, @SKU = N'ATT-1', @IsActive = 1,
         @Attributes = N'[{"name":"Colour","value":"Red"},{"name":"Size","value":"M"}]';
    DECLARE @Replaced INT = (SELECT COUNT(*) FROM dbo.VariantAttributes WHERE IDVariant = @IDVariant);
    DECLARE @Size NVARCHAR(60) = (SELECT va.Value FROM dbo.VariantAttributes AS va JOIN dbo.Attributes AS a ON a.IDAttribute = va.IDAttribute
                                  WHERE va.IDVariant = @IDVariant AND a.Name = N'Size');

    EXEC dbo.SP_Variants_Update @IDActor = @IDAdmin, @IDVariant = @IDVariant, @SKU = N'ATT-1', @IsActive = 1, @Attributes = N'[]';
    DECLARE @Cleared INT = (SELECT COUNT(*) FROM dbo.VariantAttributes WHERE IDVariant = @IDVariant);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Kept;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Replaced;
    EXEC tSQLt.AssertEqualsString @Expected = N'M', @Actual = @Size;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Cleared;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test renaming a variant to an existing sku is a conflict]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-L');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%SKU already exists%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Variants_Update @IDActor = @IDAdmin, @IDVariant = @IDVariant, @SKU = N'CAKE-S', @IsActive = 1;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a variant of an inactive product cannot be activated]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Products WHERE Name = N'Chocolate cake');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-S');
    EXEC dbo.SP_Products_Deactivate @IDActor = @IDAdmin, @IDProduct = @IDProduct;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%inactive product%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Variants_Update @IDActor = @IDAdmin, @IDVariant = @IDVariant, @SKU = N'CAKE-S', @IsActive = 1;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test updating an unknown variant answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Variant not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Variants_Update @IDActor = @IDAdmin, @IDVariant = -1, @SKU = N'X', @IsActive = 1;
END;
GO

-- Precio ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Catalogue.[test changing a price keeps both prices as text in the audit log]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-S');

    EXEC dbo.SP_Variants_ChangePrice @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewPrice = 125.75;

    DECLARE @Price DECIMAL(18,2) = (SELECT Price FROM dbo.Variants WHERE IDVariant = @IDVariant);
    DECLARE @Previous NVARCHAR(MAX) = (SELECT PreviousValue FROM dbo.AuditLog WHERE Module = N'Prices' AND EntityKey = CAST(@IDVariant AS NVARCHAR(40)));
    DECLARE @New NVARCHAR(MAX) = (SELECT NewValue FROM dbo.AuditLog WHERE Module = N'Prices' AND EntityKey = CAST(@IDVariant AS NVARCHAR(40)));
    DECLARE @PreviousPrice NVARCHAR(20) = JSON_VALUE(@Previous, '$.Price');
    DECLARE @NewPrice NVARCHAR(20) = JSON_VALUE(@New, '$.Price');

    EXEC tSQLt.AssertEquals @Expected = 125.75, @Actual = @Price;
    EXEC tSQLt.AssertEqualsString @Expected = N'100.00', @Actual = @PreviousPrice;
    EXEC tSQLt.AssertEqualsString @Expected = N'125.75', @Actual = @NewPrice;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test repeating the same price leaves no audit entry]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-S');

    EXEC dbo.SP_Variants_ChangePrice @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewPrice = 100.00;

    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Prices');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test a price of zero or less is rejected]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-S');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%NewPrice greater than zero%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Variants_ChangePrice @IDActor = @IDAdmin, @IDVariant = @IDVariant, @NewPrice = -5.00;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test only an administrator can change a price]
AS
BEGIN
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-S');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Variants_ChangePrice @IDActor = @IDCustomer, @IDVariant = @IDVariant, @NewPrice = 1.00;
END;
GO

CREATE PROCEDURE Test_Catalogue.[test changing the price of an unknown variant answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Variant not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Variants_ChangePrice @IDActor = @IDAdmin, @IDVariant = -1, @NewPrice = 10.00;
END;
GO

-- La función que protege todas las escrituras del catálogo
CREATE PROCEDURE Test_Catalogue.[test only an active administrator passes the administrator check]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @Admin INT = (SELECT COUNT(*) FROM dbo.FU_Users_ActiveAdministrator(@IDAdmin));
    DECLARE @Customer INT = (SELECT COUNT(*) FROM dbo.FU_Users_ActiveAdministrator(@IDCustomer));
    UPDATE dbo.Users SET IsActive = 0 WHERE IDUser = @IDAdmin;
    DECLARE @Disabled INT = (SELECT COUNT(*) FROM dbo.FU_Users_ActiveAdministrator(@IDAdmin));

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Admin;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Customer;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Disabled;
END;
GO

-- El ayudante interno que reemplaza los atributos, probado directamente además de a través de Create y Update
CREATE PROCEDURE Test_Catalogue.[test the attribute helper replaces the attributes of a variant]
AS
BEGIN
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'CAKE-S');

    EXEC dbo.SP_Variants_SetAttributes @IDVariant = @IDVariant, @Attributes = N'[{"name":"Size","value":"S"},{"name":"Flavour","value":"Mocha"}]';
    DECLARE @Two INT = (SELECT COUNT(*) FROM dbo.VariantAttributes WHERE IDVariant = @IDVariant);
    EXEC dbo.SP_Variants_SetAttributes @IDVariant = @IDVariant, @Attributes = N'[{"name":"Size","value":"M"}]';
    DECLARE @One INT = (SELECT COUNT(*) FROM dbo.VariantAttributes WHERE IDVariant = @IDVariant);
    EXEC dbo.SP_Variants_SetAttributes @IDVariant = @IDVariant, @Attributes = NULL;
    DECLARE @Untouched INT = (SELECT COUNT(*) FROM dbo.VariantAttributes WHERE IDVariant = @IDVariant);

    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Two;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @One;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Untouched;
END;
GO
