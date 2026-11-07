/* =====================================================================
   Objeto   : Test_EmailKey (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Clave normalizada del correo (V0014) y el límite de cupones por cliente que se apoya en ella
   Autor    : Equipo ShopCart   Fecha: 2026-11-06
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_EmailKey';
GO

CREATE PROCEDURE Test_EmailKey.SetUp
AS
BEGIN
    EXEC Test_Orders.SetUp;
END;
GO

-- Un correo y la clave que se espera de él; se inserta como cuenta real
CREATE PROCEDURE Test_EmailKey.AssertKey @Email NVARCHAR(256), @Expected NVARCHAR(256)
AS
BEGIN
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, @Email, N'not-a-real-hash', N'Key test');
    DECLARE @Actual NVARCHAR(256) = (SELECT EmailKey FROM dbo.Users WHERE Email = @Email);
    EXEC tSQLt.AssertEqualsString @Expected = @Expected, @Actual = @Actual;
END;
GO

-- Normalización --------------------------------------------------------------------------------

CREATE PROCEDURE Test_EmailKey.[test the key is lower case]
AS
BEGIN
    EXEC Test_EmailKey.AssertKey @Email = N'Maria.LOPEZ@Example.COM', @Expected = N'maria.lopez@example.com';
END;
GO

CREATE PROCEDURE Test_EmailKey.[test the plus tag is removed from the local part]
AS
BEGIN
    EXEC Test_EmailKey.AssertKey @Email = N'john.doe+promo@example.com', @Expected = N'john.doe@example.com';
    EXEC Test_EmailKey.AssertKey @Email = N'a+b+c@example.com', @Expected = N'a@example.com';
END;
GO

CREATE PROCEDURE Test_EmailKey.[test gmail ignores dots and googlemail is the same domain]
AS
BEGIN
    EXEC Test_EmailKey.AssertKey @Email = N'Ana.Lopez+offer@Gmail.com', @Expected = N'analopez@gmail.com';
    EXEC Test_EmailKey.AssertKey @Email = N'a.n.a.l.o.p.e.z@googlemail.com', @Expected = N'analopez@gmail.com';
END;
GO

CREATE PROCEDURE Test_EmailKey.[test the dots count in other domains because they can be different people]
AS
BEGIN
    EXEC Test_EmailKey.AssertKey @Email = N'john.doe@example.com', @Expected = N'john.doe@example.com';
    EXEC Test_EmailKey.AssertKey @Email = N'johndoe@example.com', @Expected = N'johndoe@example.com';
END;
GO

CREATE PROCEDURE Test_EmailKey.[test a leading plus is not a tag]
AS
BEGIN
    EXEC Test_EmailKey.AssertKey @Email = N'+tag@example.com', @Expected = N'+tag@example.com';
END;
GO

CREATE PROCEDURE Test_EmailKey.[test an invented guest email has its own key]
AS
BEGIN
    DECLARE @First INT, @Second INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @First OUTPUT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Second OUTPUT;
    DECLARE @Distinct INT = (SELECT COUNT(DISTINCT EmailKey) FROM dbo.Users WHERE IDUser IN (@First, @Second));
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Distinct;
END;
GO

CREATE PROCEDURE Test_EmailKey.[test an alias is still a different account because the email stays unique]
AS
BEGIN
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'alias.owner+one@example.com', N'not-a-real-hash', N'One');
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'alias.owner+two@example.com', N'not-a-real-hash', N'Two');
    DECLARE @Accounts INT = (SELECT COUNT(*) FROM dbo.Users WHERE EmailKey = N'alias.owner@example.com');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Accounts;
END;
GO

-- Cupones de un uso por cliente ---------------------------------------------------------------

CREATE PROCEDURE Test_EmailKey.[test a coupon of one use per customer is spent for every alias of the same person]
AS
BEGIN
    EXEC Test_Fixtures.CreateBaseData;
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'WELCOME10');
    DECLARE @Order INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    DECLARE @Now DATETIME2(3) = '2030-06-01T12:00:00';

    DECLARE @Original INT, @Alias INT, @GmailAlias INT, @Other INT, @Dotted INT;
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'ana.cliente@gmail.com', N'not-a-real-hash', N'Original');
    SET @Original = SCOPE_IDENTITY();
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'anacliente+second@gmail.com', N'not-a-real-hash', N'Tag alias');
    SET @Alias = SCOPE_IDENTITY();
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'a.n.a.c.l.i.e.n.t.e@googlemail.com', N'not-a-real-hash', N'Dot alias');
    SET @GmailAlias = SCOPE_IDENTITY();
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'someone.else@gmail.com', N'not-a-real-hash', N'Someone else');
    SET @Other = SCOPE_IDENTITY();
    -- En un dominio que no es Gmail los puntos distinguen a las personas
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'ana.cliente@example.com', N'not-a-real-hash', N'Other domain');
    SET @Dotted = SCOPE_IDENTITY();

    INSERT INTO dbo.CouponUsages (IDCoupon, IDUser, IDOrder, DiscountAmount, IsVoided) VALUES (@Coupon, @Original, @Order, 10.00, 0);

    DECLARE @ForOriginal VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Original, 20000, @Now));
    DECLARE @ForAlias VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Alias, 20000, @Now));
    DECLARE @ForGmailAlias VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @GmailAlias, 20000, @Now));
    DECLARE @ForOther VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Other, 20000, @Now));
    DECLARE @ForDotted VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Dotted, 20000, @Now));
    EXEC tSQLt.AssertEqualsString @Expected = 'PerCustomerLimit', @Actual = @ForOriginal;
    EXEC tSQLt.AssertEqualsString @Expected = 'PerCustomerLimit', @Actual = @ForAlias;
    EXEC tSQLt.AssertEqualsString @Expected = 'PerCustomerLimit', @Actual = @ForGmailAlias;
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @ForOther;
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @ForDotted;
END;
GO

CREATE PROCEDURE Test_EmailKey.[test a voided usage frees the coupon for the aliases too]
AS
BEGIN
    EXEC Test_Fixtures.CreateBaseData;
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'WELCOME10');
    DECLARE @Order INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    DECLARE @Original INT, @Alias INT;
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'void.owner@example.com', N'not-a-real-hash', N'Original');
    SET @Original = SCOPE_IDENTITY();
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'void.owner+2@example.com', N'not-a-real-hash', N'Alias');
    SET @Alias = SCOPE_IDENTITY();
    INSERT INTO dbo.CouponUsages (IDCoupon, IDUser, IDOrder, DiscountAmount, IsVoided) VALUES (@Coupon, @Original, @Order, 10.00, 1);

    DECLARE @Reason VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Alias, 20000, '2030-06-01T12:00:00'));
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @Reason;
END;
GO

-- Con el flujo completo: la cuenta alias ya no puede aplicar el cupón que la cuenta original gastó en un pedido
CREATE PROCEDURE Test_EmailKey.[test an alias account cannot apply the coupon that the original account spent in an order]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Ana, @Code = N'WELCOME10', @Now = '2030-06-01T12:00:00';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 1, @IdempotencyKey = N'key-alias-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    -- La misma persona con otra cuenta: la etiqueta +alias no cambia quién es
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'ana+alias@shopcart.test', N'not-a-real-hash', N'Ana alias');
    DECLARE @Alias INT = Test_Shop.UserId(N'ana+alias@shopcart.test');
    EXEC Test_Orders.AddLine @Email = N'ana+alias@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.AddLine @Email = N'ana+alias@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'COUPON_ALREADY_USED%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_ApplyCoupon @IDUser = @Alias, @Code = N'WELCOME10', @Now = '2030-06-01T12:10:00';
END;
GO
