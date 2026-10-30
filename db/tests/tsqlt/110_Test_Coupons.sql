/* =====================================================================
   Objeto   : Test_Coupons (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Cupones: cálculo exacto del descuento, estados, administración y aplicación al carrito
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Coupons';
GO

-- Tienda de ejemplo y los cupones que usan las pruebas: 10 % (mínimo Q100), Q10 fijo, Q25 solo para Cakes y uno vencido
CREATE PROCEDURE Test_Coupons.SetUp
AS
BEGIN
    EXEC Test_Shop.CreateStore;

    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, PerCustomerUsageLimit, IDCategory)
    VALUES (N'WELCOME10', N'Percentage', 10.00, 100.00, '2020-01-01', '2099-12-31', 1, NULL),
           (N'FIXED10', N'FixedAmount', 10.00, 0.00, '2020-01-01', '2099-12-31', NULL, NULL),
           (N'EXPIRED', N'Percentage', 10.00, 0.00, '2020-01-01', '2020-12-31', NULL, NULL);
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, IDCategory)
    VALUES (N'CAKES25', N'FixedAmount', 25.00, 0.00, '2020-01-01', '2099-12-31', Test_Shop.CategoryId(N'Cakes'));
END;
GO

-- Ejemplo numérico del diseño: A 145.00 + B 45.00 + C 55.45, cupón del 10 %
CREATE PROCEDURE Test_Coupons.[test the design example splits a tie to the even cent and closes exactly]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@Ana, N'Active');
    SET @IDCart = Test_Shop.CartIdOf(N'ana@shopcart.test');
    DECLARE @A INT = Test_Shop.VariantId(N'A-CAKE'), @B INT = Test_Shop.VariantId(N'B-COOKIE'), @C INT = Test_Shop.VariantId(N'C-CUPCAKE');
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity) VALUES (@IDCart, @A, 1), (@IDCart, @B, 1), (@IDCart, @C, 1);
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'WELCOME10');

    DECLARE @DiscountA BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = @A);
    DECLARE @DiscountB BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = @B);
    DECLARE @DiscountC BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = @C);
    DECLARE @Total BIGINT = (SELECT MAX(TotalDiscountCents) FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon));

    EXEC tSQLt.AssertEquals @Expected = 1450, @Actual = @DiscountA;
    EXEC tSQLt.AssertEquals @Expected = 450, @Actual = @DiscountB;
    EXEC tSQLt.AssertEquals @Expected = 554, @Actual = @DiscountC;
    EXEC tSQLt.AssertEquals @Expected = 2454, @Actual = @Total;   -- 2454,5 es un empate: half-up habría dado 2455
END;
GO

-- Y los totales completos del mismo ejemplo: 22091 + envío 2500 = 24591; IVA 2635; base 21956
CREATE PROCEDURE Test_Coupons.[test the design example gives the total the VAT and the taxable base]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @A INT = Test_Shop.VariantId(N'A-CAKE'), @B INT = Test_Shop.VariantId(N'B-COOKIE'), @C INT = Test_Shop.VariantId(N'C-CUPCAKE');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @A, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @B, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @C, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'welcome10';

    DECLARE @Subtotal BIGINT, @Discount BIGINT, @Shipping BIGINT, @Total BIGINT, @Vat BIGINT, @Base BIGINT;
    SELECT @Subtotal = SubtotalCents, @Discount = DiscountCents, @Shipping = ShippingCents, @Total = TotalCents, @Vat = VatCents, @Base = BaseCents
    FROM dbo.FU_Cart_Totals(@IDCart, SYSUTCDATETIME());

    EXEC tSQLt.AssertEquals @Expected = 24545, @Actual = @Subtotal;
    EXEC tSQLt.AssertEquals @Expected = 2454, @Actual = @Discount;
    EXEC tSQLt.AssertEquals @Expected = 2500, @Actual = @Shipping;
    EXEC tSQLt.AssertEquals @Expected = 24591, @Actual = @Total;
    EXEC tSQLt.AssertEquals @Expected = 2635, @Actual = @Vat;
    EXEC tSQLt.AssertEquals @Expected = 21956, @Actual = @Base;
END;
GO

-- Ejemplo de reparto del diseño: Q10.00 entre tres líneas iguales da 3.34 + 3.33 + 3.33
CREATE PROCEDURE Test_Coupons.[test ten quetzales over three equal lines give 3.34 3.33 and 3.33]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@Ana, N'Active');
    SET @IDCart = Test_Shop.CartIdOf(N'ana@shopcart.test');
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity)
    SELECT @IDCart, IDVariant, 1 FROM dbo.Variants WHERE SKU IN (N'EQ-1', N'EQ-2', N'EQ-3');
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'FIXED10');

    DECLARE @First BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = Test_Shop.VariantId(N'EQ-1'));
    DECLARE @Second BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = Test_Shop.VariantId(N'EQ-2'));
    DECLARE @Third BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = Test_Shop.VariantId(N'EQ-3'));
    EXEC tSQLt.AssertEquals @Expected = 334, @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = 333, @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 333, @Actual = @Third;
END;
GO

-- Conservación: para cualquier porcentaje de 1 a 100 la suma de las líneas es exactamente el descuento total
CREATE PROCEDURE Test_Coupons.[test the line discounts always add up to the total discount for every percentage]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@Ana, N'Active');
    SET @IDCart = Test_Shop.CartIdOf(N'ana@shopcart.test');
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity)
    SELECT @IDCart, IDVariant, 3 FROM dbo.Variants WHERE SKU IN (N'A-CAKE', N'B-COOKIE', N'C-CUPCAKE', N'EQ-1');

    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt)
    SELECT CONCAT(N'PCT', s.value), N'Percentage', CAST(s.value AS DECIMAL(18,2)) + 0.25, 0, '2020-01-01', '2099-12-31'
    FROM GENERATE_SERIES(1, 99) AS s;

    DECLARE @Broken INT = (
        SELECT COUNT(*) FROM (
            SELECT c.IDCoupon
            FROM dbo.Coupons AS c
            CROSS APPLY dbo.FU_Coupons_DiscountCalculation(@IDCart, c.IDCoupon) AS d
            WHERE c.Code LIKE N'PCT%'
            GROUP BY c.IDCoupon
            HAVING SUM(d.DiscountCents) <> MAX(d.TotalDiscountCents) OR MIN(d.DiscountCents) < 0
        ) AS x);
    DECLARE @Checked INT = (SELECT COUNT(*) FROM dbo.Coupons WHERE Code LIKE N'PCT%');
    EXEC tSQLt.AssertEquals @Expected = 99, @Actual = @Checked;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Broken;
END;
GO

CREATE PROCEDURE Test_Coupons.[test a fixed amount never discounts more than the eligible total]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt) VALUES (N'BIG', N'FixedAmount', 500.00, 0, '2020-01-01', '2099-12-31');
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'BIG');

    DECLARE @Discount BIGINT = (SELECT MAX(TotalDiscountCents) FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon));
    EXEC tSQLt.AssertEquals @Expected = 4500, @Actual = @Discount;   -- el pan cuesta 45.00, no se descuenta 500.00
END;
GO

-- Un cupón de categoría descuenta solo las líneas de esa categoría y de sus subcategorías
CREATE PROCEDURE Test_Coupons.[test a category coupon discounts only the eligible lines including subcategories]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE'), @Cookie INT = Test_Shop.VariantId(N'B-COOKIE'), @Wedding INT = Test_Shop.VariantId(N'W-WEDDING');
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cookie, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Wedding, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'CAKES25');

    DECLARE @CakeShare BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = @Cake);
    DECLARE @CookieShare BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = @Cookie);
    DECLARE @WeddingShare BIGINT = (SELECT DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon) WHERE IDVariant = @Wedding);
    DECLARE @Eligible BIGINT = (SELECT MAX(EligibleCents) FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @Coupon));

    EXEC tSQLt.AssertEquals @Expected = 64500, @Actual = @Eligible;   -- 145.00 + 500.00: el pan de otra categoría no cuenta
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @CookieShare;
    DECLARE @CakesTotal BIGINT = @CakeShare + @WeddingShare;
    EXEC tSQLt.AssertEquals @Expected = 2500, @Actual = @CakesTotal;
END;
GO

-- Estados ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Coupons.[test the coupon status gives the reason in order of precedence]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Now DATETIME2(3) = '2030-06-01T12:00:00';
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, TotalUsageLimit, UsageCount, IsActive)
    VALUES (N'OFF', N'FixedAmount', 5, 0, '2020-01-01', '2099-12-31', NULL, 0, 0),
           (N'FUTURE', N'FixedAmount', 5, 0, '2031-01-01', '2099-12-31', NULL, 0, 1),
           (N'SOLDOUT', N'FixedAmount', 5, 0, '2020-01-01', '2099-12-31', 2, 2, 1),
           (N'MIN200', N'FixedAmount', 5, 200.00, '2020-01-01', '2099-12-31', NULL, 0, 1);

    CREATE TABLE #Cases (Code NVARCHAR(30), Eligible BIGINT, Expected VARCHAR(20));
    INSERT INTO #Cases VALUES (N'FIXED10', 5000, 'Valid'), (N'OFF', 5000, 'Inactive'), (N'FUTURE', 5000, 'NotStarted'), (N'EXPIRED', 5000, 'Expired'),
                              (N'SOLDOUT', 5000, 'Exhausted'), (N'FIXED10', 0, 'NoEligibleItems'), (N'MIN200', 19999, 'BelowMinimum'), (N'MIN200', 20000, 'Valid');

    DECLARE @Wrong INT = (SELECT COUNT(*) FROM #Cases AS k
                          JOIN dbo.Coupons AS c ON c.Code = k.Code
                          CROSS APPLY dbo.FU_Coupons_Status(c.IDCoupon, @Ana, k.Eligible, @Now) AS s
                          WHERE s.Reason <> k.Expected);
    DECLARE @Unknown VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(-1, @Ana, 5000, @Now));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Wrong;
    EXEC tSQLt.AssertEqualsString @Expected = 'NotFound', @Actual = @Unknown;
END;
GO

-- Los extremos de la vigencia son inclusivos: el último segundo del último día todavía vale
CREATE PROCEDURE Test_Coupons.[test the validity window includes both of its ends]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'EXPIRED');
    DECLARE @AtStart VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Ana, 5000, '2020-01-01T00:00:00'));
    DECLARE @AtEnd VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Ana, 5000, '2020-12-31T00:00:00'));
    DECLARE @After VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Ana, 5000, '2020-12-31T00:00:01'));
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @AtStart;
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @AtEnd;
    EXEC tSQLt.AssertEqualsString @Expected = 'Expired', @Actual = @After;
END;
GO

CREATE PROCEDURE Test_Coupons.[test the per customer limit counts only the usages that were not voided]
AS
BEGIN
    EXEC Test_Fixtures.CreateBaseData;
    DECLARE @Customer INT = Test_Shop.UserId(N'fixture.customer@shopcart.test');
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'WELCOME10');
    DECLARE @Now DATETIME2(3) = '2030-06-01T12:00:00';
    INSERT INTO dbo.CouponUsages (IDCoupon, IDUser, IDOrder, DiscountAmount, IsVoided) VALUES (@Coupon, @Customer, @IDOrder, 10.00, 0);

    DECLARE @Used VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Customer, 50000, @Now));
    UPDATE dbo.CouponUsages SET IsVoided = 1 WHERE IDOrder = @IDOrder;
    DECLARE @Voided VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Customer, 50000, @Now));
    DECLARE @Other VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, Test_Shop.UserId(N'ana@shopcart.test'), 50000, @Now));

    EXEC tSQLt.AssertEqualsString @Expected = 'PerCustomerLimit', @Actual = @Used;
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @Voided;
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @Other;
END;
GO

CREATE PROCEDURE Test_Coupons.[test every rejection reason maps to its error number and a message with the api code]
AS
BEGIN
    CREATE TABLE #Cases (Reason VARCHAR(20), ErrorNumber INT, Prefix NVARCHAR(40));
    INSERT INTO #Cases VALUES ('NotFound', 50404, N'COUPON_NOT_FOUND:'), ('Inactive', 50422, N'COUPON_INACTIVE:'), ('NotStarted', 50422, N'COUPON_NOT_STARTED:'),
                              ('Expired', 50422, N'COUPON_EXPIRED:'), ('Exhausted', 50409, N'COUPON_EXHAUSTED:'),
                              ('PerCustomerLimit', 50422, N'COUPON_LIMIT_PER_CUSTOMER:'), ('NoEligibleItems', 50422, N'COUPON_NOT_APPLICABLE:'),
                              ('BelowMinimum', 50422, N'COUPON_MINIMUM_NOT_MET:');
    DECLARE @Wrong INT = (SELECT COUNT(*) FROM #Cases AS k
                          OUTER APPLY dbo.FU_Coupons_Rejection(k.Reason) AS r
                          WHERE r.ErrorNumber IS NULL OR r.ErrorNumber <> k.ErrorNumber OR LEFT(r.Message, LEN(k.Prefix)) <> k.Prefix);
    DECLARE @Valid INT = (SELECT COUNT(*) FROM dbo.FU_Coupons_Rejection('Valid'));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Wrong;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Valid;
END;
GO

-- Administración -----------------------------------------------------------------------------

CREATE PROCEDURE Test_Coupons.[test creating a coupon stores the code in capitals and leaves an audit entry]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT;
    EXEC dbo.SP_Coupons_Create @IDActor = @Admin, @Code = N' summer5 ', @Type = N'FixedAmount', @Value = 5.00, @StartsAt = '2030-01-01', @EndsAt = '2030-12-31',
         @TotalUsageLimit = 100, @PerCustomerUsageLimit = 1, @IDCategory = NULL, @IDCoupon = @IDCoupon OUTPUT;

    DECLARE @Code NVARCHAR(30) = (SELECT Code FROM dbo.Coupons WHERE IDCoupon = @IDCoupon);
    DECLARE @NewValue NVARCHAR(MAX) = (SELECT NewValue FROM dbo.AuditLog WHERE Module = N'Coupons' AND Action = N'Create' AND EntityKey = CAST(@IDCoupon AS NVARCHAR(40)));
    DECLARE @AuditedValue NVARCHAR(25) = JSON_VALUE(@NewValue, '$.Value');
    EXEC tSQLt.AssertEqualsString @Expected = N'SUMMER5', @Actual = @Code;
    EXEC tSQLt.AssertEqualsString @Expected = N'5.00', @Actual = @AuditedValue;
END;
GO

CREATE PROCEDURE Test_Coupons.[test a coupon code is unique whatever its case]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%already exists%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Coupons_Create @IDActor = @Admin, @Code = N'welcome10', @Type = N'FixedAmount', @Value = 5.00, @StartsAt = '2030-01-01', @EndsAt = '2030-12-31', @IDCoupon = @IDCoupon OUTPUT;
END;
GO

CREATE PROCEDURE Test_Coupons.[test a percentage above one hundred is rejected]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Value above zero%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Coupons_Create @IDActor = @Admin, @Code = N'OVER100', @Type = N'Percentage', @Value = 101.00, @StartsAt = '2030-01-01', @EndsAt = '2030-12-31', @IDCoupon = @IDCoupon OUTPUT;
END;
GO

CREATE PROCEDURE Test_Coupons.[test a coupon that ends before it starts is rejected]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%valid dates%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Coupons_Create @IDActor = @Admin, @Code = N'BACKWARDS', @Type = N'FixedAmount', @Value = 5.00, @StartsAt = '2030-12-31', @EndsAt = '2030-01-01', @IDCoupon = @IDCoupon OUTPUT;
END;
GO

CREATE PROCEDURE Test_Coupons.[test only an administrator can create a coupon]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCoupon INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Coupons_Create @IDActor = @Ana, @Code = N'HACK', @Type = N'FixedAmount', @Value = 500.00, @StartsAt = '2030-01-01', @EndsAt = '2030-12-31', @IDCoupon = @IDCoupon OUTPUT;
END;
GO

CREATE PROCEDURE Test_Coupons.[test a coupon for an unknown category answers not found]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Category not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Coupons_Create @IDActor = @Admin, @Code = N'GHOST', @Type = N'FixedAmount', @Value = 5.00, @StartsAt = '2030-01-01', @EndsAt = '2030-12-31', @IDCategory = -1, @IDCoupon = @IDCoupon OUTPUT;
END;
GO

CREATE PROCEDURE Test_Coupons.[test updating a coupon records the previous and the new value]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'FIXED10');

    EXEC dbo.SP_Coupons_Update @IDActor = @Admin, @IDCoupon = @IDCoupon, @Type = N'FixedAmount', @Value = 15.00, @MinimumAmount = 0, @StartsAt = '2020-01-01', @EndsAt = '2099-12-31';

    DECLARE @Previous NVARCHAR(MAX) = (SELECT PreviousValue FROM dbo.AuditLog WHERE Module = N'Coupons' AND Action = N'Update');
    DECLARE @New NVARCHAR(MAX) = (SELECT NewValue FROM dbo.AuditLog WHERE Module = N'Coupons' AND Action = N'Update');
    DECLARE @PreviousValue NVARCHAR(25) = JSON_VALUE(@Previous, '$.Value');
    DECLARE @NewValue NVARCHAR(25) = JSON_VALUE(@New, '$.Value');
    EXEC tSQLt.AssertEqualsString @Expected = N'10.00', @Actual = @PreviousValue;
    EXEC tSQLt.AssertEqualsString @Expected = N'15.00', @Actual = @NewValue;
END;
GO

CREATE PROCEDURE Test_Coupons.[test saving a coupon without changes leaves no audit entry]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'FIXED10');

    EXEC dbo.SP_Coupons_Update @IDActor = @Admin, @IDCoupon = @IDCoupon, @Type = N'FixedAmount', @Value = 10.00, @MinimumAmount = 0, @StartsAt = '2020-01-01', @EndsAt = '2099-12-31';

    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Coupons');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Coupons.[test the total limit cannot go below the uses already consumed]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'FIXED10');
    UPDATE dbo.Coupons SET TotalUsageLimit = 10, UsageCount = 6 WHERE IDCoupon = @IDCoupon;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%below the uses already consumed%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Coupons_Update @IDActor = @Admin, @IDCoupon = @IDCoupon, @Type = N'FixedAmount', @Value = 10.00, @MinimumAmount = 0,
         @StartsAt = '2020-01-01', @EndsAt = '2099-12-31', @TotalUsageLimit = 5;
END;
GO

CREATE PROCEDURE Test_Coupons.[test updating an unknown coupon answers not found]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Coupon not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Coupons_Update @IDActor = @Admin, @IDCoupon = -1, @Type = N'FixedAmount', @Value = 10.00, @StartsAt = '2020-01-01', @EndsAt = '2099-12-31';
END;
GO

CREATE PROCEDURE Test_Coupons.[test deactivating a coupon is idempotent and audited once]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDCoupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'FIXED10');

    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @IDCoupon;
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @IDCoupon;

    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Coupons WHERE IDCoupon = @IDCoupon);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Coupons' AND Action = N'Deactivate');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Coupons.[test the coupon list reports the status of each coupon and hides inactive ones]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @Fixed INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'FIXED10');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @Fixed;
    CREATE TABLE #Result (IDCoupon INT, Code NVARCHAR(30), Type NVARCHAR(12), Value NVARCHAR(25), MinimumAmount NVARCHAR(25), StartsAt DATETIME2(3),
                          EndsAt DATETIME2(3), TotalUsageLimit INT, PerCustomerUsageLimit INT, UsageCount INT, IDCategory INT, IsActive BIT,
                          Status VARCHAR(12), TotalCount INT);

    INSERT INTO #Result EXEC dbo.SP_Coupons_List @Now = '2030-06-01T12:00:00';
    DECLARE @Visible INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Expired VARCHAR(12) = (SELECT Status FROM #Result WHERE Code = N'EXPIRED');
    DECLARE @Active VARCHAR(12) = (SELECT Status FROM #Result WHERE Code = N'WELCOME10');
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Coupons_List @IncludeInactive = 1, @Now = '2030-06-01T12:00:00';
    DECLARE @All INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Inactive VARCHAR(12) = (SELECT Status FROM #Result WHERE Code = N'FIXED10');

    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Visible;
    EXEC tSQLt.AssertEqualsString @Expected = 'Expired', @Actual = @Expired;
    EXEC tSQLt.AssertEqualsString @Expected = 'Active', @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @All;
    EXEC tSQLt.AssertEqualsString @Expected = 'Inactive', @Actual = @Inactive;
END;
GO

CREATE PROCEDURE Test_Coupons.[test the coupon list rejects an invalid page size]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%PageSize%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Coupons_List @PageSize = 0;
END;
GO

-- Validar y aplicar al carrito ----------------------------------------------------------------

CREATE PROCEDURE Test_Coupons.[test validating a coupon reports the discount as text without applying it]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    INSERT INTO dbo.Carts (IDUser, Status) VALUES (@Ana, N'Active');
    SET @IDCart = Test_Shop.CartIdOf(N'ana@shopcart.test');
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity)
    SELECT @IDCart, IDVariant, 1 FROM dbo.Variants WHERE SKU IN (N'A-CAKE', N'B-COOKIE', N'C-CUPCAKE');
    CREATE TABLE #Result (IDCoupon INT, Code NVARCHAR(30), Reason VARCHAR(20), Discount NVARCHAR(25));

    INSERT INTO #Result EXEC dbo.SP_Coupons_Validate @IDUser = @Ana, @Code = N' welcome10 ';

    DECLARE @Reason VARCHAR(20) = (SELECT Reason FROM #Result);
    DECLARE @Discount NVARCHAR(25) = (SELECT Discount FROM #Result);
    DECLARE @Applied INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDCart = @IDCart AND IDCoupon IS NOT NULL);
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @Reason;
    EXEC tSQLt.AssertEqualsString @Expected = N'24.54', @Actual = @Discount;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Applied;
END;
GO

CREATE PROCEDURE Test_Coupons.[test validating reports a reason and not an error for an unknown or expired code]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    CREATE TABLE #Result (IDCoupon INT, Code NVARCHAR(30), Reason VARCHAR(20), Discount NVARCHAR(25));

    INSERT INTO #Result EXEC dbo.SP_Coupons_Validate @IDUser = @Ana, @Code = N'NOPE';
    DECLARE @Unknown VARCHAR(20) = (SELECT Reason FROM #Result);
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Coupons_Validate @IDUser = @Ana, @Code = N'EXPIRED';
    DECLARE @Expired VARCHAR(20) = (SELECT Reason FROM #Result);
    DECLARE @Discount NVARCHAR(25) = (SELECT Discount FROM #Result);

    EXEC tSQLt.AssertEqualsString @Expected = 'NotFound', @Actual = @Unknown;
    EXEC tSQLt.AssertEqualsString @Expected = 'Expired', @Actual = @Expired;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @Discount;
END;
GO

CREATE PROCEDURE Test_Coupons.[test validating without a cart answers not found]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Cart not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Coupons_Validate @IDUser = @Ana, @Code = N'WELCOME10';
END;
GO

CREATE PROCEDURE Test_Coupons.[test applying a coupon sets it on the cart and the cart shows the discount]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'W-WEDDING');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'welcome10';
    CREATE TABLE #Cart (IDCart INT, CouponCode NVARCHAR(30), CouponReason VARCHAR(20), Subtotal NVARCHAR(25), Discount NVARCHAR(25), Shipping NVARCHAR(25),
                        Total NVARCHAR(25), Vat NVARCHAR(25), TaxableBase NVARCHAR(25), ItemCount INT, HasUnavailableLines BIT, Lines NVARCHAR(MAX));
    INSERT INTO #Cart EXEC dbo.SP_Cart_Get @IDUser = @Ana;

    DECLARE @Code NVARCHAR(30) = (SELECT CouponCode FROM #Cart);
    DECLARE @Reason VARCHAR(20) = (SELECT CouponReason FROM #Cart);
    DECLARE @Discount NVARCHAR(25) = (SELECT Discount FROM #Cart);
    DECLARE @Total NVARCHAR(25) = (SELECT Total FROM #Cart);
    EXEC tSQLt.AssertEqualsString @Expected = N'WELCOME10', @Actual = @Code;
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @Reason;
    EXEC tSQLt.AssertEqualsString @Expected = N'50.00', @Actual = @Discount;
    EXEC tSQLt.AssertEqualsString @Expected = N'450.00', @Actual = @Total;   -- 500.00 - 50.00, envío gratis
END;
GO

CREATE PROCEDURE Test_Coupons.[test applying a second coupon replaces the first and removing it clears the cart]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'W-WEDDING');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10';
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'FIXED10';
    DECLARE @Second INT = (SELECT IDCoupon FROM dbo.Carts WHERE IDCart = @IDCart);

    EXEC dbo.SP_Cart_RemoveCoupon @IDUser = @Ana;
    EXEC dbo.SP_Cart_RemoveCoupon @IDUser = @Ana;
    DECLARE @After INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDCart = @IDCart AND IDCoupon IS NOT NULL);

    DECLARE @FixedCoupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'FIXED10');
    EXEC tSQLt.AssertEquals @Expected = @FixedCoupon, @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @After;
END;
GO

CREATE PROCEDURE Test_Coupons.[test a coupon below its minimum is refused with the api code]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;   -- 45.00 < 100.00
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_MINIMUM_NOT_MET:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10';
END;
GO

CREATE PROCEDURE Test_Coupons.[test an expired coupon is refused with the api code]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'W-WEDDING');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_EXPIRED:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'EXPIRED';
END;
GO

CREATE PROCEDURE Test_Coupons.[test an exhausted coupon answers a conflict]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'W-WEDDING');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    UPDATE dbo.Coupons SET TotalUsageLimit = 3, UsageCount = 3 WHERE Code = N'FIXED10';
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_EXHAUSTED:%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'FIXED10';
END;
GO

CREATE PROCEDURE Test_Coupons.[test an unknown coupon answers not found with the api code]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'W-WEDDING');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_NOT_FOUND:%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'NOPE';
END;
GO

CREATE PROCEDURE Test_Coupons.[test a category coupon is refused when no line belongs to the category]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_NOT_APPLICABLE:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'CAKES25';
END;
GO

CREATE PROCEDURE Test_Coupons.[test applying a coupon without a cart answers not found]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Cart not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'FIXED10';
END;
GO

CREATE PROCEDURE Test_Coupons.[test applying a coupon to an empty cart is a business rule violation]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cookie INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cookie, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_RemoveItem @IDUser = @Ana, @IDVariant = @Cookie;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%cart is empty%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'FIXED10';
END;
GO

-- Un cupón que vence después de aplicarse deja de descontar, pero el carrito explica por qué
CREATE PROCEDURE Test_Coupons.[test a coupon that expires after being applied stops discounting and says why]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'W-WEDDING');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10';
    UPDATE dbo.Coupons SET EndsAt = '2020-02-01', StartsAt = '2020-01-01' WHERE Code = N'WELCOME10';
    CREATE TABLE #Cart (IDCart INT, CouponCode NVARCHAR(30), CouponReason VARCHAR(20), Subtotal NVARCHAR(25), Discount NVARCHAR(25), Shipping NVARCHAR(25),
                        Total NVARCHAR(25), Vat NVARCHAR(25), TaxableBase NVARCHAR(25), ItemCount INT, HasUnavailableLines BIT, Lines NVARCHAR(MAX));
    INSERT INTO #Cart EXEC dbo.SP_Cart_Get @IDUser = @Ana;

    DECLARE @Reason VARCHAR(20) = (SELECT CouponReason FROM #Cart);
    DECLARE @Discount NVARCHAR(25) = (SELECT Discount FROM #Cart);
    DECLARE @Total NVARCHAR(25) = (SELECT Total FROM #Cart);
    EXEC tSQLt.AssertEqualsString @Expected = 'Expired', @Actual = @Reason;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @Discount;
    EXEC tSQLt.AssertEqualsString @Expected = N'500.00', @Actual = @Total;
END;
GO

-- Anti-IDOR: el cupón se aplica al carrito del usuario del token; el de otra persona no se toca
CREATE PROCEDURE Test_Coupons.[test applying a coupon never touches another customer's cart]
AS
BEGIN
    DECLARE @Sku INT = Test_Shop.VariantId(N'W-WEDDING');
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @AnaCart INT, @LuisCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Sku, @Quantity = 1, @IDCart = @AnaCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Luis, @IDVariant = @Sku, @Quantity = 1, @IDCart = @LuisCart OUTPUT;

    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'FIXED10';

    DECLARE @AnaHas INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDCart = @AnaCart AND IDCoupon IS NOT NULL);
    DECLARE @LuisHas INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDCart = @LuisCart AND IDCoupon IS NOT NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @AnaHas;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @LuisHas;
END;
GO
