/* =====================================================================
   Objeto   : bench-seed.sql
   Contenido : Volumen realista para medir listados y reportes (npm run sql:bench)
   Nota      : Solo corre en ShopCart_Bench, una base de pruebas aparte que nunca es la entregada. Inserta con sa y se
               salta los procedimientos a propósito: cargar 50 000 pedidos uno por uno tardaría horas.
   ===================================================================== */
-- cspell:ignore Pastelería Cliente Producto Tarjeta Depósito Zona carga volumen
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

-- Catálogo mínimo: una categoría, 60 productos y sus variantes
INSERT INTO dbo.Categories (Name) VALUES (N'Bench');
DECLARE @Cat INT = SCOPE_IDENTITY();
;WITH n AS (SELECT TOP (60) i = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM sys.all_objects)
INSERT INTO dbo.Products (IDCategory, Name) SELECT @Cat, CONCAT(N'Producto ', i) FROM n;
INSERT INTO dbo.Variants (IDProduct, SKU, Price, OnHandStock)
SELECT IDProduct, CONCAT(N'B-', IDProduct), 50 + (IDProduct % 10) * 25, 1000000 FROM dbo.Products;

-- 3 000 clientes
;WITH n AS (SELECT TOP (3000) i = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM sys.all_objects a CROSS JOIN sys.all_objects b)
INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
SELECT 1, CONCAT(N'bench', i, N'@shopcart.bench'), N'x', CONCAT(N'Cliente ', i) FROM n;

-- 50 000 pedidos repartidos en un año: 88 % entregados, 7 % pendientes de pago y 5 % cancelados
DECLARE @FirstUser INT = (SELECT MIN(IDUser) FROM dbo.Users WHERE Email LIKE N'bench%');
;WITH n AS (SELECT TOP (50000) i = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM sys.all_objects a CROSS JOIN sys.all_objects b),
t AS (
  SELECT i, Total = CAST(100 + (i % 40) * 15 AS DECIMAL(18,2)),
         Status = CASE WHEN i % 100 < 88 THEN 5 WHEN i % 100 < 95 THEN 1 ELSE 6 END,
         Created = DATEADD(MINUTE, -i * 10, SYSUTCDATETIME())
  FROM n)
INSERT INTO dbo.Orders (OrderNumber, IDUser, IDOrderStatus, DeliveryRecipient, DeliveryPhone, DeliveryLine1, DeliveryMunicipality,
                        DeliveryDepartment, RequestedDeliveryDate, Subtotal, Discount, Shipping, Total, TaxableBase, Vat, CreatedAt, PaidAt)
SELECT CONCAT(N'BN-', i), @FirstUser + (i % 3000), Status, N'Cliente', N'55550000', N'Zona 1', N'Guatemala', N'Guatemala',
       CAST(Created AS DATE), Total, 0, 0, Total, Total - CAST(ROUND(Total * 12 / 112, 2) AS DECIMAL(18,2)),
       CAST(ROUND(Total * 12 / 112, 2) AS DECIMAL(18,2)), Created, CASE WHEN Status = 5 THEN DATEADD(MINUTE, 20, Created) END
FROM t;

-- Una o dos líneas por pedido (75 000 en total)
INSERT INTO dbo.OrderLines (IDOrder, IDVariant, IDCategory, SKU, ProductName, Attributes, Quantity, UnitPrice, LineDiscount, LineTotal)
SELECT o.IDOrder, v.IDVariant, @Cat, v.SKU, N'Producto', N'', 1, o.Total / 2, 0, o.Total / 2
FROM dbo.Orders AS o
CROSS APPLY (SELECT TOP (2) IDVariant, SKU FROM dbo.Variants ORDER BY (IDVariant + o.IDOrder) % 60, IDVariant) AS v
WHERE o.OrderNumber LIKE N'BN-%' AND o.Total % 2 = 0;
INSERT INTO dbo.OrderLines (IDOrder, IDVariant, IDCategory, SKU, ProductName, Attributes, Quantity, UnitPrice, LineDiscount, LineTotal)
SELECT o.IDOrder, v.IDVariant, @Cat, v.SKU, N'Producto', N'', 1, o.Total, 0, o.Total
FROM dbo.Orders AS o
CROSS APPLY (SELECT TOP (1) IDVariant, SKU FROM dbo.Variants ORDER BY (IDVariant + o.IDOrder) % 60, IDVariant) AS v
WHERE o.OrderNumber LIKE N'BN-%' AND o.Total % 2 <> 0;

-- 20 000 carritos de visitante abandonados con una línea, y 300 recientes
;WITH n AS (SELECT TOP (20300) i = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM sys.all_objects a CROSS JOIN sys.all_objects b)
INSERT INTO dbo.Carts (GuestToken, Status, CreatedAt, LastActivityAt)
SELECT NEWID(), N'Active', DATEADD(HOUR, -i, SYSUTCDATETIME()),
       CASE WHEN i <= 300 THEN DATEADD(MINUTE, -i, SYSUTCDATETIME()) ELSE DATEADD(HOUR, -i / 10, SYSUTCDATETIME()) END
FROM n;
INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity)
SELECT c.IDCart, (SELECT MIN(IDVariant) FROM dbo.Variants) + (c.IDCart % 60), 1 FROM dbo.Carts AS c WHERE c.GuestToken IS NOT NULL;

-- 200 000 tokens de refresco repartidos en 8 000 familias, la mayoría ya rotados o vencidos
;WITH n AS (SELECT TOP (200000) i = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM sys.all_objects a CROSS JOIN sys.all_objects b)
INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt, RevokedAt)
SELECT @FirstUser + (i % 3000), CAST(HASHBYTES('MD5', CAST(i % 8000 AS VARBINARY(8))) AS UNIQUEIDENTIFIER),
       LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CAST(i AS VARBINARY(8))), 2)),
       DATEADD(MINUTE, -i * 3, DATEADD(DAY, 7, SYSUTCDATETIME())),
       CASE WHEN i % 10 <> 0 THEN DATEADD(MINUTE, -i * 3, SYSUTCDATETIME()) END
FROM n;

-- 200 000 filas de auditoría
;WITH n AS (SELECT TOP (200000) i = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM sys.all_objects a CROSS JOIN sys.all_objects b)
INSERT INTO dbo.AuditLog (Module, EntityName, EntityKey, Action, NewValue, IDUser, CreatedAt)
SELECT CHOOSE(1 + i % 5, N'Orders', N'Products', N'Prices', N'Stock', N'Payments'), N'Entity', CAST(1 + i % 60000 AS NVARCHAR(40)),
       N'Update', N'{}', @FirstUser, DATEADD(SECOND, -i * 20, SYSUTCDATETIME())
FROM n;

-- 60 000 movimientos de inventario de una sola variante: el kardex de un producto muy vendido
DECLARE @Variant INT = (SELECT MIN(IDVariant) FROM dbo.Variants);
;WITH n AS (SELECT TOP (60000) i = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) FROM sys.all_objects a CROSS JOIN sys.all_objects b)
INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser, CreatedAt)
SELECT @Variant, 1, 1, i, N'carga de volumen', @FirstUser, DATEADD(MINUTE, -i, SYSUTCDATETIME()) FROM n;

-- 20 000 depósitos aprobados: el historial de la cola de revisión
IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods) INSERT INTO dbo.PaymentMethods (IDPaymentMethod, Code, Name) VALUES (1, N'CARD', N'Tarjeta'), (2, N'BANK_DEPOSIT', N'Depósito');
IF NOT EXISTS (SELECT 1 FROM dbo.PaymentStatuses) INSERT INTO dbo.PaymentStatuses (IDPaymentStatus, Name)
VALUES (1, N'Pending'), (2, N'UnderReview'), (3, N'Approved'), (4, N'Rejected'), (5, N'Failed'), (6, N'Expired'), (7, N'Refunded'), (8, N'Cancelled');
INSERT INTO dbo.BankAccounts (BankName, AccountType, AccountNumber, HolderName) VALUES (N'Banco Bench', N'Checking', N'0001', N'Pastelería');
DECLARE @Bank INT = SCOPE_IDENTITY();
INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt, CreatedAt)
SELECT TOP (20000) o.IDOrder, 2, 3, o.Total, CONCAT(N'bench-', o.IDOrder), DATEADD(HOUR, 24, o.CreatedAt), o.CreatedAt
FROM dbo.Orders AS o WHERE o.IDOrderStatus = 5 ORDER BY o.IDOrder;
INSERT INTO dbo.PaymentDeposits (IDPayment, IDBankAccount, ReferenceNumber, DepositDate, DepositedAmount, IsCurrent)
SELECT p.IDPayment, @Bank, CONCAT(N'R', p.IDPayment), CAST(p.CreatedAt AS DATE), p.Amount, 1 FROM dbo.Payments AS p WHERE p.IdempotencyKey LIKE N'bench-%';

-- Estadísticas al día: el optimizador decide con ellas, y sin esto las primeras mediciones serían de otro plan
UPDATE STATISTICS dbo.Orders; UPDATE STATISTICS dbo.OrderLines; UPDATE STATISTICS dbo.Carts; UPDATE STATISTICS dbo.CartItems;
UPDATE STATISTICS dbo.RefreshTokens; UPDATE STATISTICS dbo.AuditLog; UPDATE STATISTICS dbo.InventoryMovements;
UPDATE STATISTICS dbo.Payments; UPDATE STATISTICS dbo.PaymentDeposits; UPDATE STATISTICS dbo.Users;
