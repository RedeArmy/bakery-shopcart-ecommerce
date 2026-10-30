/* =====================================================================
   Objeto   : Test_Shop (clase de ayuda de tSQLt, sin pruebas propias)
   Version  : 1.0.0
   Cambio   : Tienda de ejemplo y consultas cortas que comparten las pruebas del carrito y de los cupones
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Shop';
GO

-- Atajos para que las pruebas no repitan subconsultas. Son funciones escalares porque solo existen en la base de pruebas.
CREATE FUNCTION Test_Shop.UserId (@Email NVARCHAR(256)) RETURNS INT
AS
BEGIN
    RETURN (SELECT IDUser FROM dbo.Users WHERE Email = @Email);
END;
GO

CREATE FUNCTION Test_Shop.VariantId (@SKU NVARCHAR(40)) RETURNS INT
AS
BEGIN
    RETURN (SELECT IDVariant FROM dbo.Variants WHERE SKU = @SKU);
END;
GO

CREATE FUNCTION Test_Shop.CategoryId (@Name NVARCHAR(80)) RETURNS INT
AS
BEGIN
    RETURN (SELECT IDCategory FROM dbo.Categories WHERE Name = @Name);
END;
GO

CREATE FUNCTION Test_Shop.CartIdOf (@Email NVARCHAR(256)) RETURNS INT
AS
BEGIN
    RETURN (SELECT c.IDCart FROM dbo.Carts AS c JOIN dbo.Users AS u ON u.IDUser = c.IDUser WHERE u.Email = @Email AND c.Status = N'Active');
END;
GO

-- Una administradora y dos clientes; las categorías Cakes (con la hija Wedding cakes), Cookies y Cupcakes; y las variantes del
-- ejemplo numérico del diseño: A Q145.00, B Q45.00 y C Q55.45, más una de bodas de Q500.00 y tres de Q100.00 para repartos exactos.
-- Todas con 10 unidades, ingresadas directamente porque estas pruebas no ejercitan el libro de inventario.
CREATE PROCEDURE Test_Shop.CreateStore
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 1) INSERT INTO dbo.Roles (IDRole, Name) VALUES (1, N'Customer');
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 3) INSERT INTO dbo.Roles (IDRole, Name) VALUES (3, N'Administrator');

    -- La configuración viene de la semilla; se asegura por si la prueba corre sin semillas
    IF NOT EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'VatRate') INSERT INTO dbo.Configuration VALUES (N'VatRate', N'12');
    IF NOT EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'ReservationMinutes') INSERT INTO dbo.Configuration VALUES (N'ReservationMinutes', N'15');

    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (3, N'admin@shopcart.test', N'not-a-real-hash', N'Test Admin'),
           (1, N'ana@shopcart.test', N'not-a-real-hash', N'Ana'),
           (1, N'luis@shopcart.test', N'not-a-real-hash', N'Luis');

    INSERT INTO dbo.Categories (Name) VALUES (N'Cakes'), (N'Cookies'), (N'Cupcakes');
    INSERT INTO dbo.Categories (Name, IDParentCategory) SELECT N'Wedding cakes', IDCategory FROM dbo.Categories WHERE Name = N'Cakes';

    INSERT INTO dbo.Products (IDCategory, Name)
    SELECT c.IDCategory, p.Name
    FROM (VALUES (N'Cakes', N'Milk cake'), (N'Cookies', N'Oat cookies'), (N'Cupcakes', N'Velvet cupcakes'),
                 (N'Wedding cakes', N'Wedding tier'), (N'Cakes', N'Equal share')) AS p (Category, Name)
    JOIN dbo.Categories AS c ON c.Name = p.Category;

    INSERT INTO dbo.Variants (IDProduct, SKU, Price, OnHandStock)
    SELECT pr.IDProduct, v.SKU, v.Price, 10
    FROM (VALUES (N'Milk cake', N'A-CAKE', 145.00), (N'Oat cookies', N'B-COOKIE', 45.00), (N'Velvet cupcakes', N'C-CUPCAKE', 55.45),
                 (N'Wedding tier', N'W-WEDDING', 500.00),
                 (N'Equal share', N'EQ-1', 100.00), (N'Equal share', N'EQ-2', 100.00), (N'Equal share', N'EQ-3', 100.00)) AS v (Product, SKU, Price)
    JOIN dbo.Products AS pr ON pr.Name = v.Product;
END;
GO
