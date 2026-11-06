/* =====================================================================
   Objeto   : Test_Guests y Test_GuestOrders (clases de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Cuentas de invitado: alta, contacto, recuperación, reglas del carrito, cupones por correo y pedido
   Autor    : Equipo ShopCart   Fecha: 2026-11-06
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Guests';
GO

CREATE PROCEDURE Test_Guests.SetUp
AS
BEGIN
    EXEC Test_Shop.CreateStore;
END;
GO

-- Alta ---------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Guests.[test creating a guest makes a flagged customer account with an invented email and an unusable password]
AS
BEGIN
    DECLARE @IDUser INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @IDUser OUTPUT;

    DECLARE @IsGuest INT = (SELECT CAST(IsGuest AS INT) FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Role INT = (SELECT IDRole FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Invented INT = (SELECT COUNT(*) FROM dbo.Users WHERE IDUser = @IDUser AND Email LIKE N'guest-%@guest.invalid');
    DECLARE @Hash NVARCHAR(255) = (SELECT PasswordHash FROM dbo.Users WHERE IDUser = @IDUser);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @IsGuest;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Role;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Invented;
    EXEC tSQLt.AssertEqualsString @Expected = N'!', @Actual = @Hash;
END;
GO

CREATE PROCEDURE Test_Guests.[test two guests never share the invented email]
AS
BEGIN
    DECLARE @First INT, @Second INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @First OUTPUT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Second OUTPUT;
    DECLARE @Distinct INT = (SELECT COUNT(DISTINCT Email) FROM dbo.Users WHERE IDUser IN (@First, @Second));
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Distinct;
END;
GO

CREATE PROCEDURE Test_Guests.[test a guest cannot be given a staff role]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%CK_Users_GuestIsCustomer%';
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName, IsGuest)
    VALUES (3, N'guest-staff@guest.invalid', N'!', N'Guest', 1);
END;
GO

-- Contacto -----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Guests.[test the contact data of a guest is saved trimmed]
AS
BEGIN
    DECLARE @IDUser INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @IDUser OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @IDUser, @Email = N'  maria@example.test ', @FullName = N' Mary Smith ', @Phone = N' 55551234 ';

    DECLARE @Email NVARCHAR(256) = (SELECT Email FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Name NVARCHAR(120) = (SELECT FullName FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Phone NVARCHAR(20) = (SELECT Phone FROM dbo.Users WHERE IDUser = @IDUser);
    EXEC tSQLt.AssertEqualsString @Expected = N'maria@example.test', @Actual = @Email;
    EXEC tSQLt.AssertEqualsString @Expected = N'Mary Smith', @Actual = @Name;
    EXEC tSQLt.AssertEqualsString @Expected = N'55551234', @Actual = @Phone;
END;
GO

CREATE PROCEDURE Test_Guests.[test an invented email is not accepted as contact data]
AS
BEGIN
    DECLARE @IDUser INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @IDUser OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%real contact email%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @IDUser, @Email = N'someone@guest.invalid', @FullName = N'Someone';
END;
GO

CREATE PROCEDURE Test_Guests.[test the email of a registered account cannot be used by a guest]
AS
BEGIN
    DECLARE @IDUser INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @IDUser OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'EMAIL_BELONGS_TO_ACCOUNT%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @IDUser, @Email = N'ANA@shopcart.test', @FullName = N'Impostor';
END;
GO

CREATE PROCEDURE Test_Guests.[test only a guest account has contact data of its own]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%guest account%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Ana, @Email = N'other@example.test', @FullName = N'Other';
END;
GO

CREATE PROCEDURE Test_Guests.[test an unknown account has no contact data to save]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = -1, @Email = N'x@example.test', @FullName = N'X';
END;
GO

CREATE PROCEDURE Test_Guests.[test several guests can buy with the same email]
AS
BEGIN
    DECLARE @First INT, @Second INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @First OUTPUT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Second OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @First, @Email = N'same@example.test', @FullName = N'Same';
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Second, @Email = N'same@example.test', @FullName = N'Same';
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Users WHERE Email = N'same@example.test' AND IsGuest = 1);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

-- Cuentas reales y correos de invitado --------------------------------------------------------

CREATE PROCEDURE Test_Guests.[test someone can register with the email they used as a guest]
AS
BEGIN
    DECLARE @Guest INT, @Registered INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Guest, @Email = N'later@example.test', @FullName = N'Later';
    EXEC dbo.SP_Users_Register @Email = N'later@example.test', @PasswordHash = N'hash', @FullName = N'Later', @IDUser = @Registered OUTPUT;
    DECLARE @Accounts INT = (SELECT COUNT(*) FROM dbo.Users WHERE Email = N'later@example.test');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Accounts;
END;
GO

CREATE PROCEDURE Test_Guests.[test two real accounts still cannot share an email]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UX_Users_Email_Accounts%';
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (1, N'ANA@SHOPCART.TEST', N'not-a-real-hash', N'Duplicate');
END;
GO

CREATE PROCEDURE Test_Guests.[test the login lookup never returns a guest]
AS
BEGIN
    DECLARE @Guest INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Guest, @Email = N'guest.login@example.test', @FullName = N'Guest';

    CREATE TABLE #Result (IDUser INT, IDRole TINYINT, RoleName NVARCHAR(30), Email NVARCHAR(256), PasswordHash NVARCHAR(255),
                          FullName NVARCHAR(120), Phone NVARCHAR(20), IsActive BIT, FailedAttempts TINYINT, LockedUntil DATETIME2(3), IsLocked BIT);
    INSERT INTO #Result EXEC dbo.SP_Users_GetByEmail @Email = N'guest.login@example.test';
    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Guests.[test the profile of a guest says it is a guest]
AS
BEGIN
    DECLARE @Guest INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    CREATE TABLE #Result (IDUser INT, IDRole TINYINT, RoleName NVARCHAR(30), Email NVARCHAR(256), FullName NVARCHAR(120), Phone NVARCHAR(20), IsActive BIT, IsGuest BIT);
    INSERT INTO #Result EXEC dbo.SP_Users_GetById @IDUser = @Guest;
    INSERT INTO #Result EXEC dbo.SP_Users_GetById @IDUser = @Ana;
    DECLARE @GuestFlag INT = (SELECT CAST(IsGuest AS INT) FROM #Result WHERE IDUser = @Guest);
    DECLARE @AnaFlag INT = (SELECT CAST(IsGuest AS INT) FROM #Result WHERE IDUser = @Ana);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @GuestFlag;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @AnaFlag;
END;
GO

CREATE PROCEDURE Test_Guests.[test the user list does not include guests]
AS
BEGIN
    DECLARE @Guest INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    CREATE TABLE #Page (IDUser INT, Email NVARCHAR(256), FullName NVARCHAR(120), Phone NVARCHAR(20), IDRole TINYINT, RoleName NVARCHAR(30), IsActive BIT,
                        LockedUntil DATETIME2(3), CreatedAt DATETIME2(3), TotalCount INT);
    INSERT INTO #Page EXEC dbo.SP_Users_List;
    DECLARE @Listed INT = (SELECT COUNT(*) FROM #Page WHERE IDUser = @Guest);
    DECLARE @Total INT = (SELECT TOP (1) TotalCount FROM #Page);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Listed;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Total;
END;
GO

-- Recuperación -------------------------------------------------------------------------------

CREATE PROCEDURE Test_Guests.[test the recovery code needs a contact email]
AS
BEGIN
    DECLARE @Guest INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%no contact email%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Users_SetRecoveryCode @IDUser = @Guest, @CodeHash = '1111111111111111111111111111111111111111111111111111111111111111';
END;
GO

CREATE PROCEDURE Test_Guests.[test a new recovery code replaces the old one]
AS
BEGIN
    DECLARE @Guest INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Guest, @Email = N'recover@example.test', @FullName = N'Recover';
    EXEC dbo.SP_Users_SetRecoveryCode @IDUser = @Guest, @CodeHash = '1111111111111111111111111111111111111111111111111111111111111111';
    EXEC dbo.SP_Users_SetRecoveryCode @IDUser = @Guest, @CodeHash = '2222222222222222222222222222222222222222222222222222222222222222';

    DECLARE @Stored CHAR(64) = (SELECT GuestRecoveryHash FROM dbo.Users WHERE IDUser = @Guest);
    EXEC tSQLt.AssertEqualsString @Expected = '2222222222222222222222222222222222222222222222222222222222222222', @Actual = @Stored;
END;
GO

CREATE PROCEDURE Test_Guests.[test a registered account has no recovery code]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%guest account%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Users_SetRecoveryCode @IDUser = @Ana, @CodeHash = '1111111111111111111111111111111111111111111111111111111111111111';
END;
GO

CREATE PROCEDURE Test_Guests.[test the recovery lookup returns only active guests of that email that have a code]
AS
BEGIN
    DECLARE @WithCode INT, @WithoutCode INT, @Inactive INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @WithCode OUTPUT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @WithoutCode OUTPUT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Inactive OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @WithCode, @Email = N'find@example.test', @FullName = N'A';
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @WithoutCode, @Email = N'find@example.test', @FullName = N'B';
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Inactive, @Email = N'find@example.test', @FullName = N'C';
    EXEC dbo.SP_Users_SetRecoveryCode @IDUser = @WithCode, @CodeHash = '3333333333333333333333333333333333333333333333333333333333333333';
    EXEC dbo.SP_Users_SetRecoveryCode @IDUser = @Inactive, @CodeHash = '4444444444444444444444444444444444444444444444444444444444444444';
    UPDATE dbo.Users SET IsActive = 0 WHERE IDUser = @Inactive;

    CREATE TABLE #Found (IDUser INT, GuestRecoveryHash CHAR(64));
    INSERT INTO #Found EXEC dbo.SP_Users_FindGuestsByEmail @Email = N' find@example.test ';
    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Found);
    DECLARE @Only INT = (SELECT IDUser FROM #Found);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEquals @Expected = @WithCode, @Actual = @Only;

    DECLARE @None INT;
    CREATE TABLE #Unknown (IDUser INT, GuestRecoveryHash CHAR(64));
    INSERT INTO #Unknown EXEC dbo.SP_Users_FindGuestsByEmail @Email = N'ana@shopcart.test';
    SET @None = (SELECT COUNT(*) FROM #Unknown);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @None;
END;
GO

-- Carrito: personalización y productos por encargo ------------------------------------------

CREATE PROCEDURE Test_Guests.[test a visitor cart accepts a same day product and refuses a personalisation]
AS
BEGIN
    DECLARE @Cookie INT = Test_Shop.VariantId(N'B-COOKIE'), @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cookie, @Quantity = 2, @IDCart = @IDCart OUTPUT;
    DECLARE @Lines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @IDCart);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Lines;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'ACCOUNT_REQUIRED%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cookie, @Quantity = 2,
         @Inscription = N'Happy birthday', @IDCart = @IDCart OUTPUT;
END;
GO

CREATE PROCEDURE Test_Guests.[test a visitor cart refuses a made to order product]
AS
BEGIN
    UPDATE dbo.Products SET LeadTimeDays = 2 WHERE Name = N'Milk cake';
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE'), @IDCart INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'ACCOUNT_REQUIRED%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cake, @Quantity = 1, @IDCart = @IDCart OUTPUT;
END;
GO

CREATE PROCEDURE Test_Guests.[test a guest account takes a same day product]
AS
BEGIN
    DECLARE @Guest INT, @IDCart INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    DECLARE @Cookie INT = Test_Shop.VariantId(N'B-COOKIE');
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Guest, @IDVariant = @Cookie, @Quantity = 3, @IDCart = @IDCart OUTPUT;
    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @IDCart AND IDVariant = @Cookie);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Quantity;
END;
GO

CREATE PROCEDURE Test_Guests.[test a guest account refuses a personalisation]
AS
BEGIN
    DECLARE @Guest INT, @IDCart INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    DECLARE @Cookie INT = Test_Shop.VariantId(N'B-COOKIE');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'ACCOUNT_REQUIRED%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Guest, @IDVariant = @Cookie, @Quantity = 3, @Inscription = N'Hi', @IDCart = @IDCart OUTPUT;
END;
GO

CREATE PROCEDURE Test_Guests.[test a guest account refuses a made to order product]
AS
BEGIN
    UPDATE dbo.Products SET LeadTimeDays = 2 WHERE Name = N'Milk cake';
    DECLARE @Guest INT, @IDCart INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'ACCOUNT_REQUIRED%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Guest, @IDVariant = @Cake, @Quantity = 1, @IDCart = @IDCart OUTPUT;
END;
GO

CREATE PROCEDURE Test_Guests.[test a registered account can still personalise and order a made to order product]
AS
BEGIN
    UPDATE dbo.Products SET LeadTimeDays = 2 WHERE Name = N'Milk cake';
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Cake INT = Test_Shop.VariantId(N'A-CAKE'), @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 1, @Inscription = N'Happy birthday', @IDCart = @IDCart OUTPUT;
    DECLARE @Saved NVARCHAR(60) = (SELECT Inscription FROM dbo.CartItems WHERE IDCart = @IDCart);
    EXEC tSQLt.AssertEqualsString @Expected = N'Happy birthday', @Actual = @Saved;
END;
GO

-- Cupones: el cliente es el correo -----------------------------------------------------------

CREATE PROCEDURE Test_Guests.[test the per customer limit counts the usages of every account with the same email]
AS
BEGIN
    EXEC Test_Fixtures.CreateBaseData;
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, PerCustomerUsageLimit)
    VALUES (N'WELCOME10', N'Percentage', 10.00, 100.00, '2020-01-01', '2099-12-31', 1);
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'WELCOME10');
    DECLARE @Now DATETIME2(3) = '2030-06-01T12:00:00';

    -- Dos compras sin registro con el mismo correo: la primera usó el cupón
    DECLARE @First INT, @Second INT, @Other INT, @Registered INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @First OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @First, @Email = N'shared@example.test', @FullName = N'First purchase';
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Second OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Second, @Email = N'SHARED@example.test', @FullName = N'Second purchase';
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Other OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Other, @Email = N'someone.else@example.test', @FullName = N'Someone else';
    INSERT INTO dbo.CouponUsages (IDCoupon, IDUser, IDOrder, DiscountAmount, IsVoided) VALUES (@Coupon, @First, @IDOrder, 10.00, 0);

    -- Después ese correo se registra como cuenta real
    EXEC dbo.SP_Users_Register @Email = N'shared@example.test', @PasswordHash = N'hash', @FullName = N'Registered', @IDUser = @Registered OUTPUT;

    DECLARE @ForFirst VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @First, 20000, @Now));
    DECLARE @ForSecond VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Second, 20000, @Now));
    DECLARE @ForRegistered VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Registered, 20000, @Now));
    DECLARE @ForOther VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Other, 20000, @Now));
    EXEC tSQLt.AssertEqualsString @Expected = 'PerCustomerLimit', @Actual = @ForFirst;
    EXEC tSQLt.AssertEqualsString @Expected = 'PerCustomerLimit', @Actual = @ForSecond;
    EXEC tSQLt.AssertEqualsString @Expected = 'PerCustomerLimit', @Actual = @ForRegistered;
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @ForOther;
END;
GO

CREATE PROCEDURE Test_Guests.[test a guest that has not given an email yet never shares a coupon count]
AS
BEGIN
    EXEC Test_Fixtures.CreateBaseData;
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, PerCustomerUsageLimit)
    VALUES (N'WELCOME10', N'Percentage', 10.00, 100.00, '2020-01-01', '2099-12-31', 1);
    DECLARE @Customer INT = Test_Shop.UserId(N'fixture.customer@shopcart.test');
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    DECLARE @Coupon INT = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'WELCOME10');
    INSERT INTO dbo.CouponUsages (IDCoupon, IDUser, IDOrder, DiscountAmount, IsVoided) VALUES (@Coupon, @Customer, @IDOrder, 10.00, 0);

    DECLARE @Guest INT;
    EXEC dbo.SP_Users_CreateGuest @IDUser = @Guest OUTPUT;
    DECLARE @Reason VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@Coupon, @Guest, 20000, '2030-06-01T12:00:00'));
    EXEC tSQLt.AssertEqualsString @Expected = 'Valid', @Actual = @Reason;
END;
GO

-- Pedido y reserva ---------------------------------------------------------------------------

EXEC tSQLt.NewTestClass 'Test_GuestOrders';
GO

CREATE PROCEDURE Test_GuestOrders.SetUp
AS
BEGIN
    EXEC Test_Orders.SetUp;
END;
GO

-- Un invitado con una dirección propia y un carrito de productos del mismo día
CREATE PROCEDURE Test_GuestOrders.NewGuestWithCart @IDUser INT OUTPUT, @IDAddress INT OUTPUT
AS
BEGIN
    DECLARE @IDCart INT, @Cookie INT = Test_Shop.VariantId(N'B-COOKIE');
    EXEC dbo.SP_Users_CreateGuest @IDUser = @IDUser OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @IDUser, @IDVariant = @Cookie, @Quantity = 2, @Now = '2030-06-01T12:00:00', @IDCart = @IDCart OUTPUT;
    INSERT INTO dbo.Addresses (IDUser, Label, Recipient, Phone, Line1, Municipality, Department)
    VALUES (@IDUser, N'Home', N'Guest', N'55550000', N'5th Avenue 10-20', N'Guatemala', N'Guatemala');
    SET @IDAddress = SCOPE_IDENTITY();
END;
GO

CREATE PROCEDURE Test_GuestOrders.[test a guest cannot create an order without a contact email]
AS
BEGIN
    DECLARE @Guest INT, @Address INT, @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_GuestOrders.NewGuestWithCart @IDUser = @Guest OUTPUT, @IDAddress = @Address OUTPUT;
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @Guest);
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Guest, @IDCart = @IDCart, @Now = '2030-06-01T12:00:00', @IDReservation = @IDReservation OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'GUEST_CONTACT_REQUIRED%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Guest, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-guest-1', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

CREATE PROCEDURE Test_GuestOrders.[test a guest with a contact email creates its own order]
AS
BEGIN
    DECLARE @Guest INT, @Address INT, @IDReservation INT, @IDOrder INT, @IDPayment INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_GuestOrders.NewGuestWithCart @IDUser = @Guest OUTPUT, @IDAddress = @Address OUTPUT;
    EXEC dbo.SP_Users_SetGuestContact @IDUser = @Guest, @Email = N'buyer@example.test', @FullName = N'Buyer', @Phone = N'55551234';
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @Guest);
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Guest, @IDCart = @IDCart, @Now = '2030-06-01T12:00:00', @IDReservation = @IDReservation OUTPUT;
    DECLARE @Bank INT = Test_Orders.BankId(N'Test Bank');

    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Guest, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-10',
         @IDPaymentMethod = 2, @IDBankAccount = @Bank, @IdempotencyKey = N'key-guest-2', @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;

    DECLARE @Owner INT = (SELECT IDUser FROM dbo.Orders WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = @Guest, @Actual = @Owner;
END;
GO

CREATE PROCEDURE Test_GuestOrders.[test a guest cannot reserve a cart that holds a product that became made to order]
AS
BEGIN
    DECLARE @Guest INT, @Address INT, @IDReservation INT;
    EXEC Test_GuestOrders.NewGuestWithCart @IDUser = @Guest OUTPUT, @IDAddress = @Address OUTPUT;
    -- El producto pasó a pedirse con anticipación después de agregarlo al carrito
    UPDATE dbo.Products SET LeadTimeDays = 3 WHERE Name = N'Oat cookies';
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @Guest);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'ACCOUNT_REQUIRED%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Guest, @IDCart = @IDCart, @Now = '2030-06-01T12:00:00', @IDReservation = @IDReservation OUTPUT;
END;
GO
