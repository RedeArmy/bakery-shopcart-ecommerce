/* =====================================================================
   Objeto   : Test_Fixtures (clase de ayuda de tSQLt, sin pruebas propias)
   Version  : 1.0.0
   Cambio   : Datos base compartidos por las pruebas de restricciones y triggers
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Fixtures';
GO

-- Las pruebas de restricciones y triggers usan las tablas reales (FakeTable las dejaría sin restricciones).
-- Por eso necesitan filas padre válidas. Los valores de referencia se insertan solo si faltan, para que
-- la prueba siga funcionando cuando las semillas ya los hayan cargado. Cada prueba se deshace al terminar,
-- aunque los IDENTITY no retroceden: las pruebas buscan las filas por su clave natural, nunca por número.
CREATE PROCEDURE Test_Fixtures.CreateBaseData
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 1)
        INSERT INTO dbo.Roles (IDRole, Name) VALUES (1, N'Customer');

    DECLARE @StatusIndex TINYINT = 1;
    WHILE @StatusIndex <= 8
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM dbo.OrderStatuses WHERE IDOrderStatus = @StatusIndex)
            INSERT INTO dbo.OrderStatuses (IDOrderStatus, Name) VALUES (@StatusIndex, CONCAT(N'OrderStatus', @StatusIndex));
        IF NOT EXISTS (SELECT 1 FROM dbo.PaymentStatuses WHERE IDPaymentStatus = @StatusIndex)
            INSERT INTO dbo.PaymentStatuses (IDPaymentStatus, Name) VALUES (@StatusIndex, CONCAT(N'PaymentStatus', @StatusIndex));
        SET @StatusIndex += 1;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE IDPaymentMethod = 1)
        INSERT INTO dbo.PaymentMethods (IDPaymentMethod, Code, Name) VALUES (1, N'FIXTURE_CARD', N'Fixture card');
    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE IDPaymentMethod = 2)
        INSERT INTO dbo.PaymentMethods (IDPaymentMethod, Code, Name) VALUES (2, N'FIXTURE_BANK_DEPOSIT', N'Fixture bank deposit');

    IF NOT EXISTS (SELECT 1 FROM dbo.InventoryMovementTypes WHERE IDInventoryMovementType = 2)
        INSERT INTO dbo.InventoryMovementTypes (IDInventoryMovementType, Name) VALUES (2, N'Exit');

    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (1, N'fixture.customer@shopcart.test', N'not-a-real-hash', N'Fixture Customer');

    INSERT INTO dbo.Categories (Name) VALUES (N'Fixture category');

    INSERT INTO dbo.Products (IDCategory, Name)
    SELECT IDCategory, N'Fixture product' FROM dbo.Categories WHERE Name = N'Fixture category';

    INSERT INTO dbo.Variants (IDProduct, SKU, Price, OnHandStock)
    SELECT IDProduct, N'FIXTURE-SKU', 10.00, 5 FROM dbo.Products WHERE Name = N'Fixture product';

    -- Pedido pendiente de pago con montos coherentes: 100.00 + 25.00 de envío = 125.00 (IVA incluido)
    INSERT INTO dbo.Orders
        (OrderNumber, IDUser, IDOrderStatus, DeliveryRecipient, DeliveryPhone, DeliveryLine1,
         DeliveryMunicipality, DeliveryDepartment, RequestedDeliveryDate,
         Subtotal, Discount, Shipping, Total, TaxableBase, Vat)
    SELECT N'FIX-0001', IDUser, 1, N'Fixture', N'55550000', N'Line 1', N'Municipality', N'Department', '2030-01-01',
           100.00, 0.00, 25.00, 125.00, 111.61, 13.39
    FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test';

    INSERT INTO dbo.OrderLines
        (IDOrder, IDVariant, IDCategory, SKU, ProductName, Attributes, Quantity, UnitPrice, LineDiscount, LineTotal)
    SELECT o.IDOrder, v.IDVariant, c.IDCategory, N'FIXTURE-SKU', N'Fixture product', N'none', 10, 10.00, 0.00, 100.00
    FROM dbo.Orders AS o
    CROSS JOIN dbo.Variants AS v
    CROSS JOIN dbo.Categories AS c
    WHERE o.OrderNumber = N'FIX-0001' AND v.SKU = N'FIXTURE-SKU' AND c.Name = N'Fixture category';
END;
GO
