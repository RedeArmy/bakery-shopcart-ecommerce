/* =====================================================================
   Objeto   : Test_Orders (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Creación del pedido: importes recalculados, cupón, pago, reserva, idempotencia y reglas de negocio
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). La carrera por el último uso de un cupón y el doble clic
              sobre una misma reserva los cubre npm run sql:concurrency.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Orders';
GO

CREATE FUNCTION Test_Orders.AddressId (@Email NVARCHAR(256)) RETURNS INT
AS
BEGIN
    RETURN (SELECT a.IDAddress FROM dbo.Addresses AS a JOIN dbo.Users AS u ON u.IDUser = a.IDUser WHERE u.Email = @Email AND a.IsActive = 1);
END;
GO

CREATE FUNCTION Test_Orders.BankId (@Bank NVARCHAR(80)) RETURNS INT
AS
BEGIN
    RETURN (SELECT IDBankAccount FROM dbo.BankAccounts WHERE BankName = @Bank);
END;
GO

CREATE FUNCTION Test_Orders.CouponId (@Code NVARCHAR(30)) RETURNS INT
AS
BEGIN
    RETURN (SELECT IDCoupon FROM dbo.Coupons WHERE Code = @Code);
END;
GO

-- Tienda de ejemplo (A 145.00, B 45.00, C 55.45), direcciones, cuentas bancarias, cupones y los valores de referencia que los
-- pedidos necesitan. Los valores de referencia se insertan solo si faltan, por si la prueba corre sin semillas.
CREATE PROCEDURE Test_Orders.SetUp
AS
BEGIN
    EXEC Test_Shop.CreateStore;

    IF NOT EXISTS (SELECT 1 FROM dbo.OrderStatuses WHERE IDOrderStatus = 1) INSERT INTO dbo.OrderStatuses VALUES (1, N'PendingPayment');
    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentStatuses WHERE IDPaymentStatus = 1) INSERT INTO dbo.PaymentStatuses VALUES (1, N'Pending');
    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE IDPaymentMethod = 1) INSERT INTO dbo.PaymentMethods VALUES (1, N'CARD', N'Card');
    IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE IDPaymentMethod = 2) INSERT INTO dbo.PaymentMethods VALUES (2, N'BANK_DEPOSIT', N'BankDeposit');
    IF NOT EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'DepositReservationHours') INSERT INTO dbo.Configuration VALUES (N'DepositReservationHours', N'24');
    IF NOT EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'MinDepositHours') INSERT INTO dbo.Configuration VALUES (N'MinDepositHours', N'2');

    INSERT INTO dbo.Addresses (IDUser, Label, Recipient, Phone, Line1, Municipality, Department)
    SELECT IDUser, N'Home', FullName, N'55550000', N'5th Avenue 10-20', N'Guatemala', N'Guatemala' FROM dbo.Users WHERE Email IN (N'ana@shopcart.test', N'luis@shopcart.test');

    INSERT INTO dbo.BankAccounts (BankName, AccountType, AccountNumber, HolderName, IsActive)
    VALUES (N'Test Bank', N'Checking', N'1112223334', N'Pastelería', 1), (N'Old Bank', N'Savings', N'9998887776', N'Pastelería', 0);

    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, PerCustomerUsageLimit)
    VALUES (N'WELCOME10', N'Percentage', 10.00, 100.00, '2020-01-01', '2099-12-31', 1);
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, TotalUsageLimit)
    VALUES (N'ONCE10', N'FixedAmount', 10.00, 0.00, '2020-01-01', '2099-12-31', 1);
END;
GO

-- Ayudas ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Orders.AddLine @Email NVARCHAR(256), @SKU NVARCHAR(40), @Quantity INT
AS
BEGIN
    DECLARE @IDUser INT = Test_Shop.UserId(@Email), @IDVariant INT = Test_Shop.VariantId(@SKU), @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @IDUser, @IDVariant = @IDVariant, @Quantity = @Quantity, @Now = '2030-06-01T12:00:00', @IDCart = @IDCart OUTPUT;
END;
GO

-- El carrito del ejemplo del diseño: A + B + C, una unidad de cada una
CREATE PROCEDURE Test_Orders.AddExampleLines @Email NVARCHAR(256)
AS
BEGIN
    EXEC Test_Orders.AddLine @Email = @Email, @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.AddLine @Email = @Email, @SKU = N'B-COOKIE', @Quantity = 1;
    EXEC Test_Orders.AddLine @Email = @Email, @SKU = N'C-CUPCAKE', @Quantity = 1;
END;
GO

CREATE PROCEDURE Test_Orders.Reserve @Email NVARCHAR(256), @IDReservation INT OUTPUT
AS
BEGIN
    DECLARE @IDUser INT = Test_Shop.UserId(@Email), @IDCart INT = Test_Shop.CartIdOf(@Email);
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @Now = '2030-06-01T12:00:00', @IDReservation = @IDReservation OUTPUT;
END;
GO

-- Tarjeta ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Orders.[test a card order is born pending with the recalculated amounts and the customer's data frozen]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Subtotal DECIMAL(18,2) = (SELECT Subtotal FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Discount DECIMAL(18,2) = (SELECT Discount FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Shipping DECIMAL(18,2) = (SELECT Shipping FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Total DECIMAL(18,2) = (SELECT Total FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Vat DECIMAL(18,2) = (SELECT Vat FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Base DECIMAL(18,2) = (SELECT TaxableBase FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Recipient NVARCHAR(120) = (SELECT DeliveryRecipient FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @PaidAt INT = (SELECT COUNT(*) FROM dbo.Orders WHERE IDOrder = @IDOrder AND PaidAt IS NOT NULL);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 245.45, @Actual = @Subtotal;
    EXEC tSQLt.AssertEquals @Expected = 0.00, @Actual = @Discount;
    EXEC tSQLt.AssertEquals @Expected = 0.00, @Actual = @Shipping;
    EXEC tSQLt.AssertEquals @Expected = 245.45, @Actual = @Total;
    EXEC tSQLt.AssertEquals @Expected = 26.30, @Actual = @Vat;           -- 24545 * 12 / 112 = 2629,82
    EXEC tSQLt.AssertEquals @Expected = 219.15, @Actual = @Base;
    EXEC tSQLt.AssertEqualsString @Expected = N'Ana', @Actual = @Recipient;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @PaidAt;
END;
GO

CREATE PROCEDURE Test_Orders.[test the payment is created pending for the order total and expires with the reservation window]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Amount DECIMAL(18,2) = (SELECT Amount FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @Method INT = (SELECT IDPaymentMethod FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @ExpiresText VARCHAR(23) = CONVERT(VARCHAR(23), @Expires, 121);
    DECLARE @Deposits INT = (SELECT COUNT(*) FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    EXEC tSQLt.AssertEquals @Expected = 245.45, @Actual = @Amount;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Method;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-01 12:20:00.000', @Actual = @ExpiresText;   -- 15 minutos desde las 12:05
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Deposits;
END;
GO

CREATE PROCEDURE Test_Orders.[test the order number has the year and the zero padded identifier]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Stored NVARCHAR(20) = (SELECT OrderNumber FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Expected NVARCHAR(20) = CONCAT(N'PED-2030-', RIGHT(CONCAT(N'000000', @IDOrder), 6));
    EXEC tSQLt.AssertEqualsString @Expected = @Expected, @Actual = @Number;
    EXEC tSQLt.AssertEqualsString @Expected = @Expected, @Actual = @Stored;
END;
GO

-- Las líneas guardan una copia de lo vendido, no una referencia a un precio que puede cambiar
CREATE PROCEDURE Test_Orders.[test the order lines freeze the sku name and price that were sold]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 2;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
    UPDATE dbo.Variants SET Price = 999.00 WHERE SKU = N'A-CAKE';

    DECLARE @SKU NVARCHAR(40) = (SELECT SKU FROM dbo.OrderLines WHERE IDOrder = @IDOrder);
    DECLARE @Name NVARCHAR(150) = (SELECT ProductName FROM dbo.OrderLines WHERE IDOrder = @IDOrder);
    DECLARE @UnitPrice DECIMAL(18,2) = (SELECT UnitPrice FROM dbo.OrderLines WHERE IDOrder = @IDOrder);
    DECLARE @LineTotal DECIMAL(18,2) = (SELECT LineTotal FROM dbo.OrderLines WHERE IDOrder = @IDOrder);
    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.OrderLines WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEqualsString @Expected = N'A-CAKE', @Actual = @SKU;
    EXEC tSQLt.AssertEqualsString @Expected = N'Milk cake', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = 145.00, @Actual = @UnitPrice;
    EXEC tSQLt.AssertEquals @Expected = 290.00, @Actual = @LineTotal;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Quantity;
END;
GO

CREATE PROCEDURE Test_Orders.[test the reservation moves to the order and the cart is converted without touching the stock]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 3;
    DECLARE @IDCart INT = Test_Shop.CartIdOf(N'ana@shopcart.test');
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @LinkedOrder INT = (SELECT IDOrder FROM dbo.Reservations WHERE IDReservation = @IDReservation);
    DECLARE @ReservationExpiry VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), ExpiresAt, 121) FROM dbo.Reservations WHERE IDReservation = @IDReservation);
    DECLARE @PaymentExpiry VARCHAR(23) = CONVERT(VARCHAR(23), @Expires, 121);
    DECLARE @ReservationStatus NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDReservation = @IDReservation);
    DECLARE @CartStatus NVARCHAR(12) = (SELECT Status FROM dbo.Carts WHERE IDCart = @IDCart);
    DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.Variants WHERE SKU = N'A-CAKE');
    DECLARE @Reserved INT = (SELECT ReservedStock FROM dbo.Variants WHERE SKU = N'A-CAKE');
    DECLARE @Movements INT = (SELECT COUNT(*) FROM dbo.InventoryMovements);
    EXEC tSQLt.AssertEquals @Expected = @IDOrder, @Actual = @LinkedOrder;
    EXEC tSQLt.AssertEqualsString @Expected = @PaymentExpiry, @Actual = @ReservationExpiry;
    EXEC tSQLt.AssertEqualsString @Expected = N'Active', @Actual = @ReservationStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'Converted', @Actual = @CartStatus;
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @OnHand;     -- la existencia física baja al confirmarse el pago
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Reserved;    -- y las unidades siguen reservadas
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Movements;
END;
GO

CREATE PROCEDURE Test_Orders.[test creating the order leaves the status histories and an audit entry]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @OrderHistory INT = (SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE IDOrder = @IDOrder AND IDPreviousStatus IS NULL AND IDNewStatus = 1 AND IDUser = @Ana);
    DECLARE @PaymentHistory INT = (SELECT COUNT(*) FROM dbo.PaymentStatusHistory WHERE IDPayment = @IDPayment AND IDPreviousStatus IS NULL AND IDNewStatus = 1);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Orders' AND Action = N'Create' AND EntityKey = CAST(@IDOrder AS NVARCHAR(40)) AND IDUser = @Ana);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OrderHistory;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PaymentHistory;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

-- Cupón ---------------------------------------------------------------------------------------

-- El ejemplo del diseño de extremo a extremo: 10 % de Q245.45 es Q24.54, repartido 14.50 / 4.50 / 5.54
CREATE PROCEDURE Test_Orders.[test the design example with a coupon gives the exact discount per line and total]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Discount DECIMAL(18,2) = (SELECT Discount FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Total DECIMAL(18,2) = (SELECT Total FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Vat DECIMAL(18,2) = (SELECT Vat FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Base DECIMAL(18,2) = (SELECT TaxableBase FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Code NVARCHAR(30) = (SELECT CouponCode FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @DiscountA DECIMAL(18,2) = (SELECT LineDiscount FROM dbo.OrderLines WHERE IDOrder = @IDOrder AND SKU = N'A-CAKE');
    DECLARE @DiscountB DECIMAL(18,2) = (SELECT LineDiscount FROM dbo.OrderLines WHERE IDOrder = @IDOrder AND SKU = N'B-COOKIE');
    DECLARE @DiscountC DECIMAL(18,2) = (SELECT LineDiscount FROM dbo.OrderLines WHERE IDOrder = @IDOrder AND SKU = N'C-CUPCAKE');
    DECLARE @LinesTotal DECIMAL(18,2) = (SELECT SUM(LineTotal) FROM dbo.OrderLines WHERE IDOrder = @IDOrder);
    DECLARE @Usage INT = (SELECT UsageCount FROM dbo.Coupons WHERE Code = N'WELCOME10');
    DECLARE @Usages INT = (SELECT COUNT(*) FROM dbo.CouponUsages WHERE IDOrder = @IDOrder AND DiscountAmount = 24.54 AND IsVoided = 0);

    EXEC tSQLt.AssertEquals @Expected = 24.54, @Actual = @Discount;
    EXEC tSQLt.AssertEquals @Expected = 220.91, @Actual = @Total;
    EXEC tSQLt.AssertEquals @Expected = 23.67, @Actual = @Vat;           -- 22091 * 12 / 112 = 2366,89
    EXEC tSQLt.AssertEquals @Expected = 197.24, @Actual = @Base;
    EXEC tSQLt.AssertEqualsString @Expected = N'WELCOME10', @Actual = @Code;
    EXEC tSQLt.AssertEquals @Expected = 14.50, @Actual = @DiscountA;
    EXEC tSQLt.AssertEquals @Expected = 4.50, @Actual = @DiscountB;
    EXEC tSQLt.AssertEquals @Expected = 5.54, @Actual = @DiscountC;
    EXEC tSQLt.AssertEquals @Expected = 220.91, @Actual = @LinesTotal;   -- las líneas suman exactamente el total
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Usage;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Usages;
END;
GO

-- Contar el uso antes de calcular haría que un cupón de un solo uso pasara a "agotado" y perdiera su propio descuento
CREATE PROCEDURE Test_Orders.[test a coupon with a single use keeps its own discount]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'ONCE10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Discount DECIMAL(18,2) = (SELECT Discount FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Total DECIMAL(18,2) = (SELECT Total FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Usage INT = (SELECT UsageCount FROM dbo.Coupons WHERE Code = N'ONCE10');
    EXEC tSQLt.AssertEquals @Expected = 10.00, @Actual = @Discount;
    EXEC tSQLt.AssertEquals @Expected = 135.00, @Actual = @Total;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Usage;
END;
GO

CREATE PROCEDURE Test_Orders.[test a coupon that expired after being applied stops the order with its code]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    UPDATE dbo.Coupons SET StartsAt = '2020-01-01', EndsAt = '2030-06-01T12:01:00' WHERE Code = N'WELCOME10';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_EXPIRED:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test a coupon that sold out after being applied stops the order with a conflict]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'ONCE10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    UPDATE dbo.Coupons SET UsageCount = 1 WHERE Code = N'ONCE10';   -- otro cliente se llevó el último uso

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_EXHAUSTED:%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

-- Un cupón de un uso por cliente: el segundo pedido del mismo cliente se rechaza como ya usado
CREATE PROCEDURE Test_Orders.[test a coupon already used by the customer stops the next order as already used]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @First INT, @Second INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @First OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @First, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    UPDATE dbo.Carts SET IDCoupon = Test_Orders.CouponId(N'WELCOME10') WHERE IDCart = Test_Shop.CartIdOf(N'ana@shopcart.test');
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @Second OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_ALREADY_USED:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @Second, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-2', @Now = '2030-06-01T12:06:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test an order whose total would be zero is refused]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt) VALUES (N'FREE', N'FixedAmount', 1000.00, 0, '2020-01-01', '2099-12-31');
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'FREE', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%greater than zero%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

-- Depósito ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Orders.[test a deposit order keeps the chosen bank account and holds stock for up to twenty four hours]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test'), @Bank INT = Test_Orders.BankId(N'Test Bank');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-20',
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-1', @IDBankAccount = @Bank, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Method INT = (SELECT IDPaymentMethod FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @Account INT = (SELECT IDBankAccount FROM dbo.PaymentDeposits WHERE IDPayment = @IDPayment);
    DECLARE @ExpiresText VARCHAR(23) = CONVERT(VARCHAR(23), @Expires, 121);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Method;
    EXEC tSQLt.AssertEquals @Expected = @Bank, @Actual = @Account;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-02 12:05:00.000', @Actual = @ExpiresText;
END;
GO

-- ADR-0016: un pastel que se entrega pronto no retiene existencias un día entero; la fecha límite la fija la entrega
CREATE PROCEDURE Test_Orders.[test a deposit deadline is capped by the delivery date minus the lead time]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test'), @Bank INT = Test_Orders.BankId(N'Test Bank');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    UPDATE dbo.Products SET LeadTimeDays = 1 WHERE Name = N'Milk cake';
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-03',
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-1', @IDBankAccount = @Bank, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @ExpiresText VARCHAR(23) = CONVERT(VARCHAR(23), @Expires, 121);
    -- Entrega el 3 a las 00:00 de Guatemala = 06:00 UTC; menos 1 día de anticipación = 2 a las 06:00 UTC, antes que las 24 horas
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-02 06:00:00.000', @Actual = @ExpiresText;
END;
GO

CREATE PROCEDURE Test_Orders.[test a deposit is unavailable when too little time remains before the delivery]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test'), @Bank INT = Test_Orders.BankId(N'Test Bank');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'DEPOSIT_UNAVAILABLE_FOR_DATE:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-01',
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-1', @IDBankAccount = @Bank, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test the same delivery date is fine with a card because the card window is short]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-01',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Created INT = (SELECT COUNT(*) FROM dbo.Orders WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Created;
END;
GO

CREATE PROCEDURE Test_Orders.[test the deposit window function returns the earlier of the hold and the delivery cap]
AS
BEGIN
    DECLARE @Hold VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), DeadlineAt, 121) FROM dbo.FU_Payments_DepositWindow('2030-06-20', 0, '2030-06-01T12:00:00'));
    DECLARE @HoldMinutes INT = (SELECT MinutesAvailable FROM dbo.FU_Payments_DepositWindow('2030-06-20', 0, '2030-06-01T12:00:00'));
    DECLARE @Cap VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), DeadlineAt, 121) FROM dbo.FU_Payments_DepositWindow('2030-06-02', 1, '2030-06-01T12:00:00'));
    DECLARE @Late INT = (SELECT MinutesAvailable FROM dbo.FU_Payments_DepositWindow('2030-06-01', 0, '2030-06-01T12:00:00'));
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-02 12:00:00.000', @Actual = @Hold;
    EXEC tSQLt.AssertEquals @Expected = 1440, @Actual = @HoldMinutes;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-01 06:00:00.000', @Actual = @Cap;   -- entrega el 2 a las 06:00 UTC menos un día
    EXEC tSQLt.AssertEquals @Expected = -360, @Actual = @Late;   -- la entrega de hoy a las 00:00 de Guatemala ya pasó
END;
GO

-- Reglas del método de pago y de la cuenta --------------------------------------------------------

CREATE PROCEDURE Test_Orders.[test an unknown payment method is rejected]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%IDPaymentMethod must be%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = 1, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 3, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test a deposit without a bank account is rejected]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%bank account is required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = 1, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test a card payment with a bank account is rejected]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test'), @Bank INT = Test_Orders.BankId(N'Test Bank');
    DECLARE @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%takes no bank account%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = 1, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @IDBankAccount = @Bank, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test an inactive bank account answers not found]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test'), @Old INT = Test_Orders.BankId(N'Old Bank');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Bank account not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-1', @IDBankAccount = @Old, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

-- Reserva ---------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Orders.[test a reservation that does not exist answers not found]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Reservation not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = -1, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

-- Anti-IDOR: la reserva de otra persona responde igual que una inexistente
CREATE PROCEDURE Test_Orders.[test another customer's reservation answers not found]
AS
BEGIN
    DECLARE @Luis INT = Test_Shop.UserId(N'luis@shopcart.test'), @LuisAddress INT = Test_Orders.AddressId(N'luis@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Reservation not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Luis, @IDReservation = @IDReservation, @IDAddress = @LuisAddress, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test a reservation past its expiry stops the order with the api code]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;   -- vence a las 12:15

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'RESERVATION_EXPIRED:%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:15:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test a reservation released because the cart changed stops the order]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1;   -- editar el carrito libera la reserva

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'RESERVATION_EXPIRED:%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

-- Red de seguridad: si el carrito cambiara sin liberar la reserva, el pedido no debe cobrar otra cosa
CREATE PROCEDURE Test_Orders.[test a cart that differs from its reservation stops the order]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 2;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    UPDATE dbo.CartItems SET Quantity = 5 WHERE IDCart = Test_Shop.CartIdOf(N'ana@shopcart.test');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'RESERVATION_EXPIRED:%cart changed%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test a variant withdrawn after reserving stops the order]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    UPDATE dbo.Variants SET IsActive = 0 WHERE SKU = N'A-CAKE';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INSUFFICIENT_STOCK:%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

-- Dirección y fecha ---------------------------------------------------------------------------

CREATE PROCEDURE Test_Orders.[test another customer's address answers not found]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @LuisAddress INT = Test_Orders.AddressId(N'luis@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Address not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @LuisAddress, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test a delivery date earlier than the longest lead time is refused]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    UPDATE dbo.Products SET LeadTimeDays = 3 WHERE Name = N'Velvet cupcakes';
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'DELIVERY_DATE_TOO_SOON:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-03',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test the first delivery date the lead time allows is accepted]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    UPDATE dbo.Products SET LeadTimeDays = 3 WHERE Name = N'Velvet cupcakes';
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-04',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Created INT = (SELECT COUNT(*) FROM dbo.Orders WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Created;
END;
GO

-- Idempotencia -----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Orders.[test repeating the creation with the same key returns the same order and creates no second one]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    DECLARE @SecondOrder INT, @SecondPayment INT, @SecondNumber NVARCHAR(20), @SecondExpires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:06:00',
         @IDOrder = @SecondOrder OUTPUT, @IDPayment = @SecondPayment OUTPUT, @OrderNumber = @SecondNumber OUTPUT, @PaymentExpiresAt = @SecondExpires OUTPUT;

    DECLARE @Orders INT = (SELECT COUNT(*) FROM dbo.Orders);
    DECLARE @Payments INT = (SELECT COUNT(*) FROM dbo.Payments);
    DECLARE @CouponUses INT = (SELECT UsageCount FROM dbo.Coupons WHERE Code = N'WELCOME10');
    EXEC tSQLt.AssertEquals @Expected = @IDOrder, @Actual = @SecondOrder;
    EXEC tSQLt.AssertEquals @Expected = @IDPayment, @Actual = @SecondPayment;
    EXEC tSQLt.AssertEqualsString @Expected = @Number, @Actual = @SecondNumber;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Orders;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Payments;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @CouponUses;   -- el cupón no se cuenta dos veces
END;
GO

CREATE PROCEDURE Test_Orders.[test another key for a reservation that already has an order is a conflict]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%already belongs to another order%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-2', @Now = '2030-06-01T12:06:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_Orders.[test a key already used for another order is a conflict]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @First INT, @Second INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @First OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @First, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @Second OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'IDEMPOTENCY_KEY_IN_USE:%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @Second, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:06:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

-- La reserva ligada a un pedido ya no la libera el job de expiración: la gobierna el vencimiento del pago
CREATE PROCEDURE Test_Orders.[test the expiry job leaves the reservation of an order alone]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 2;
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    CREATE TABLE #Result (ReleasedReservations INT);
    INSERT INTO #Result EXEC dbo.SP_Inventory_ReleaseExpiredReservations @Now = '2031-01-01T00:00:00';

    DECLARE @Released INT = (SELECT ReleasedReservations FROM #Result);
    DECLARE @Reserved INT = (SELECT ReservedStock FROM dbo.Variants WHERE SKU = N'A-CAKE');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Released;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Reserved;
END;
GO

-- Validación ---------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Orders.[test the order needs every identifier and a key]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = NULL, @IDReservation = 1, @IDAddress = 1, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-1',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO
