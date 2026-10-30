/* =====================================================================
   Objeto   : Test_Cart (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Carrito con cantidades absolutas, visitante y cliente, fusión, totales y liberación de la reserva
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Cart';
GO

CREATE PROCEDURE Test_Cart.SetUp
AS
BEGIN
    EXEC Test_Shop.CreateStore;
END;
GO

-- Lectura ------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Cart.[test a customer without a cart gets an empty cart and nothing is created]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    CREATE TABLE #Cart (IDCart INT, CouponCode NVARCHAR(30), CouponReason VARCHAR(20), Subtotal NVARCHAR(25), Discount NVARCHAR(25),
                        Total NVARCHAR(25), Vat NVARCHAR(25), TaxableBase NVARCHAR(25), ItemCount INT, HasUnavailableLines BIT, Lines NVARCHAR(MAX));
    INSERT INTO #Cart EXEC dbo.SP_Cart_Get @IDUser = @Ana;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Cart);
    DECLARE @IDCart INT = (SELECT IDCart FROM #Cart);
    DECLARE @Total NVARCHAR(25) = (SELECT Total FROM #Cart);
    DECLARE @Lines NVARCHAR(MAX) = (SELECT Lines FROM #Cart);
    DECLARE @Carts INT = (SELECT COUNT(*) FROM dbo.Carts);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @IDCart;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @Total;
    EXEC tSQLt.AssertEqualsString @Expected = N'[]', @Actual = @Lines;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Carts;
END;
GO

CREATE PROCEDURE Test_Cart.[test the cart needs exactly one of the user and the guest token]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @NoneError INT = 0, @BothError INT = 0;
    BEGIN TRY EXEC dbo.SP_Cart_Get; END TRY BEGIN CATCH SET @NoneError = ERROR_NUMBER(); END CATCH;
    BEGIN TRY EXEC dbo.SP_Cart_Get @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111'; END TRY BEGIN CATCH SET @BothError = ERROR_NUMBER(); END CATCH;

    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @NoneError;
    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @BothError;
END;
GO

-- Escritura ----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Cart.[test setting a quantity creates the cart and the line]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 2, @Inscription = N' Happy birthday ', @IDCart = @IDCart OUTPUT;

    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @IDCart AND IDVariant = @Variant);
    DECLARE @Inscription NVARCHAR(60) = (SELECT Inscription FROM dbo.CartItems WHERE IDCart = @IDCart AND IDVariant = @Variant);
    DECLARE @Owner INT = (SELECT IDUser FROM dbo.Carts WHERE IDCart = @IDCart);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Quantity;
    EXEC tSQLt.AssertEqualsString @Expected = N'Happy birthday', @Actual = @Inscription;
    EXEC tSQLt.AssertEquals @Expected = @Ana, @Actual = @Owner;
END;
GO

-- ADR-0013: repetir la solicitud no cambia el resultado y la cantidad se fija, no se suma
CREATE PROCEDURE Test_Cart.[test the quantity is absolute so repeating a request changes nothing]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 3, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 3, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 1, @IDCart = @IDCart OUTPUT;

    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @IDCart);
    DECLARE @Lines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @IDCart);
    DECLARE @Carts INT = (SELECT COUNT(*) FROM dbo.Carts);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Quantity;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Lines;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Carts;
END;
GO

CREATE PROCEDURE Test_Cart.[test a guest cart is kept apart by its token]
AS
BEGIN
    DECLARE @Variant INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @FirstCart INT, @SecondCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Variant, @Quantity = 1, @IDCart = @FirstCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '22222222-2222-2222-2222-222222222222', @IDVariant = @Variant, @Quantity = 5, @IDCart = @SecondCart OUTPUT;

    DECLARE @FirstQuantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @FirstCart);
    DECLARE @Different INT = CASE WHEN @FirstCart <> @SecondCart THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @FirstQuantity;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Different;
END;
GO

CREATE PROCEDURE Test_Cart.[test a quantity outside 1 to 99 is rejected]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%between 1 and 99%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 100, @IDCart = @IDCart OUTPUT;
END;
GO

-- RF-04: no se puede agregar más cantidad que la existencia disponible (10 unidades por variante en el fixture)
CREATE PROCEDURE Test_Cart.[test a quantity above the available stock is rejected]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INSUFFICIENT_STOCK: Only 10 units are available.', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 11, @IDCart = @IDCart OUTPUT;
END;
GO

CREATE PROCEDURE Test_Cart.[test a rejected first quantity creates no cart]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT, @Error INT = 0;
    BEGIN TRY EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 11, @IDCart = @IDCart OUTPUT; END TRY
    BEGIN CATCH SET @Error = ERROR_NUMBER(); END CATCH;
    DECLARE @Carts INT = (SELECT COUNT(*) FROM dbo.Carts);

    EXEC tSQLt.AssertEquals @Expected = 50409, @Actual = @Error;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Carts;
END;
GO

CREATE PROCEDURE Test_Cart.[test a rejected increase keeps the previous quantity]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cookie INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @IDCart INT, @Error INT = 0;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cookie, @Quantity = 4, @IDCart = @IDCart OUTPUT;
    BEGIN TRY EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cookie, @Quantity = 40, @IDCart = @IDCart OUTPUT; END TRY
    BEGIN CATCH SET @Error = ERROR_NUMBER(); END CATCH;
    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @IDCart AND IDVariant = @Cookie);

    EXEC tSQLt.AssertEquals @Expected = 50409, @Actual = @Error;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Quantity;
END;
GO

CREATE PROCEDURE Test_Cart.[test exactly the available stock is accepted]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 10, @IDCart = @IDCart OUTPUT;

    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @IDCart AND IDVariant = @Variant);
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @Quantity;
END;
GO

CREATE PROCEDURE Test_Cart.[test a guest cannot exceed the available stock either]
AS
BEGIN
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INSUFFICIENT_STOCK%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Variant, @Quantity = 11, @IDCart = @IDCart OUTPUT;
END;
GO

-- Lo que otro cliente tiene reservado ya no está disponible para este
CREATE PROCEDURE Test_Cart.[test units reserved by another customer are not available]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @LuisCart INT, @AnaCart INT, @IDReservation INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Luis, @IDVariant = @Variant, @Quantity = 4, @IDCart = @LuisCart OUTPUT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Luis, @IDCart = @LuisCart, @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 6, @IDCart = @AnaCart OUTPUT;
    DECLARE @Accepted INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @AnaCart);
    DECLARE @Error INT = 0, @Message NVARCHAR(200);
    BEGIN TRY EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 7, @IDCart = @AnaCart OUTPUT; END TRY
    BEGIN CATCH SET @Error = ERROR_NUMBER(); SET @Message = ERROR_MESSAGE(); END CATCH;

    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @Accepted;
    EXEC tSQLt.AssertEquals @Expected = 50409, @Actual = @Error;
    EXEC tSQLt.AssertEqualsString @Expected = N'INSUFFICIENT_STOCK: Only 6 units are available.', @Actual = @Message;
END;
GO

-- Las unidades que reservó el propio carrito no cuentan contra él: repetir la cantidad reservada sigue siendo válido
CREATE PROCEDURE Test_Cart.[test the units the own cart reserved count as available]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT, @IDReservation INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 10, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Ana, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 10, @IDCart = @IDCart OUTPUT;

    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @IDCart AND IDVariant = @Variant);
    DECLARE @Held INT = (SELECT ReservedStock FROM dbo.Variants WHERE IDVariant = @Variant);
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @Quantity;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Held;
END;
GO

-- Si la existencia bajó por debajo de lo que había en el carrito, bajar la cantidad sigue permitido
CREATE PROCEDURE Test_Cart.[test lowering the quantity is allowed after the stock has dropped]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 8, @IDCart = @IDCart OUTPUT;
    UPDATE dbo.Variants SET OnHandStock = 3 WHERE IDVariant = @Variant;

    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 3, @IDCart = @IDCart OUTPUT;

    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @IDCart AND IDVariant = @Variant);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Quantity;
END;
GO

CREATE PROCEDURE Test_Cart.[test an unknown variant answers not found]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Variant not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = -1, @Quantity = 1, @IDCart = @IDCart OUTPUT;
END;
GO

CREATE PROCEDURE Test_Cart.[test an inactive variant cannot be added]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Variant INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT;
    UPDATE dbo.Variants SET IsActive = 0 WHERE IDVariant = @Variant;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%not available%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Variant, @Quantity = 1, @IDCart = @IDCart OUTPUT;
END;
GO

CREATE PROCEDURE Test_Cart.[test removing a line is harmless when repeated or when there is no cart]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE'), @Cookie INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @IDCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cookie, @Quantity = 1, @IDCart = @IDCart OUTPUT;

    EXEC dbo.SP_Cart_RemoveItem @IDUser = @Ana, @IDVariant = @Cake;
    EXEC dbo.SP_Cart_RemoveItem @IDUser = @Ana, @IDVariant = @Cake;
    EXEC dbo.SP_Cart_RemoveItem @IDUser = @Luis, @IDVariant = @Cake;

    DECLARE @Lines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @IDCart);
    DECLARE @Remaining INT = (SELECT IDVariant FROM dbo.CartItems WHERE IDCart = @IDCart);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Lines;
    EXEC tSQLt.AssertEquals @Expected = @Cookie, @Actual = @Remaining;
END;
GO

-- Anti-IDOR: quitar la línea de otra persona no la toca, porque el carrito se busca por el usuario del token
CREATE PROCEDURE Test_Cart.[test one customer cannot remove a line from another customer's cart]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @AnaCart INT, @LuisCart INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 1, @IDCart = @AnaCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Luis, @IDVariant = @Cake, @Quantity = 1, @IDCart = @LuisCart OUTPUT;

    EXEC dbo.SP_Cart_RemoveItem @IDUser = @Luis, @IDVariant = @Cake;

    DECLARE @AnaLines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @AnaCart);
    DECLARE @LuisLines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @LuisCart);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @AnaLines;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @LuisLines;
END;
GO

-- Totales ------------------------------------------------------------------------------------

-- El ejemplo numérico del diseño: A 145.00 + B 45.00 + C 55.45 = 245.45. No hay envío: el total es el subtotal
CREATE PROCEDURE Test_Cart.[test the cart totals of the design example without a coupon]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    DECLARE @A INT = Test_Shop.VariantId(N'A-CAKE'), @B INT = Test_Shop.VariantId(N'B-COOKIE'), @C INT = Test_Shop.VariantId(N'C-CUPCAKE');
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @A, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @B, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @C, @Quantity = 1, @IDCart = @IDCart OUTPUT;

    CREATE TABLE #Cart (IDCart INT, CouponCode NVARCHAR(30), CouponReason VARCHAR(20), Subtotal NVARCHAR(25), Discount NVARCHAR(25),
                        Total NVARCHAR(25), Vat NVARCHAR(25), TaxableBase NVARCHAR(25), ItemCount INT, HasUnavailableLines BIT, Lines NVARCHAR(MAX));
    INSERT INTO #Cart EXEC dbo.SP_Cart_Get @IDUser = @Ana;

    DECLARE @Subtotal NVARCHAR(25) = (SELECT Subtotal FROM #Cart);
    DECLARE @Discount NVARCHAR(25) = (SELECT Discount FROM #Cart);
    DECLARE @Total NVARCHAR(25) = (SELECT Total FROM #Cart);
    DECLARE @Items INT = (SELECT ItemCount FROM #Cart);
    EXEC tSQLt.AssertEqualsString @Expected = N'245.45', @Actual = @Subtotal;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @Discount;
    EXEC tSQLt.AssertEqualsString @Expected = N'245.45', @Actual = @Total;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Items;
END;
GO

CREATE PROCEDURE Test_Cart.[test no shipping is added whatever the subtotal]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    DECLARE @Cookie INT = Test_Shop.VariantId(N'B-COOKIE'), @Wedding INT = Test_Shop.VariantId(N'W-WEDDING');
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cookie, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    CREATE TABLE #Cart (IDCart INT, CouponCode NVARCHAR(30), CouponReason VARCHAR(20), Subtotal NVARCHAR(25), Discount NVARCHAR(25),
                        Total NVARCHAR(25), Vat NVARCHAR(25), TaxableBase NVARCHAR(25), ItemCount INT, HasUnavailableLines BIT, Lines NVARCHAR(MAX));

    INSERT INTO #Cart EXEC dbo.SP_Cart_Get @IDUser = @Ana;
    DECLARE @SmallTotal NVARCHAR(25) = (SELECT Total FROM #Cart);
    DELETE FROM #Cart;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Wedding, @Quantity = 1, @IDCart = @IDCart OUTPUT;
    INSERT INTO #Cart EXEC dbo.SP_Cart_Get @IDUser = @Ana;
    DECLARE @LargeTotal NVARCHAR(25) = (SELECT Total FROM #Cart);

    EXEC tSQLt.AssertEqualsString @Expected = N'45.00', @Actual = @SmallTotal;
    EXEC tSQLt.AssertEqualsString @Expected = N'545.00', @Actual = @LargeTotal;
END;
GO

CREATE PROCEDURE Test_Cart.[test the cart lines carry prices as text availability and the unavailable flag]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @IDCart INT;
    DECLARE @A INT = Test_Shop.VariantId(N'A-CAKE');
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @A, @Quantity = 2, @IDCart = @IDCart OUTPUT;
    CREATE TABLE #Cart (IDCart INT, CouponCode NVARCHAR(30), CouponReason VARCHAR(20), Subtotal NVARCHAR(25), Discount NVARCHAR(25),
                        Total NVARCHAR(25), Vat NVARCHAR(25), TaxableBase NVARCHAR(25), ItemCount INT, HasUnavailableLines BIT, Lines NVARCHAR(MAX));

    INSERT INTO #Cart EXEC dbo.SP_Cart_Get @IDUser = @Ana;
    DECLARE @Lines NVARCHAR(MAX) = (SELECT Lines FROM #Cart);
    DECLARE @UnitPrice NVARCHAR(25) = JSON_VALUE(@Lines, '$[0].UnitPrice');
    DECLARE @LineTotal NVARCHAR(25) = JSON_VALUE(@Lines, '$[0].LineTotal');
    DECLARE @Available INT = CAST(JSON_VALUE(@Lines, '$[0].Available') AS INT);
    DECLARE @Flag1 INT = (SELECT CAST(HasUnavailableLines AS INT) FROM #Cart);
    DELETE FROM #Cart;

    UPDATE dbo.Variants SET OnHandStock = 1 WHERE IDVariant = @A;
    INSERT INTO #Cart EXEC dbo.SP_Cart_Get @IDUser = @Ana;
    DECLARE @Flag2 INT = (SELECT CAST(HasUnavailableLines AS INT) FROM #Cart);

    EXEC tSQLt.AssertEqualsString @Expected = N'145.00', @Actual = @UnitPrice;
    EXEC tSQLt.AssertEqualsString @Expected = N'290.00', @Actual = @LineTotal;
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @Available;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Flag1;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Flag2;
END;
GO

-- Fusión y existencia (RF-04): se ejecuta al iniciar sesión, así que ajusta las cantidades y nunca lanza ----------------------

CREATE PROCEDURE Test_Cart.[test merging adds the quantities only up to the stock available to the customer]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @UserCart INT, @GuestCart INT, @LuisCart INT, @Merged INT, @IDReservation INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Luis, @IDVariant = @Cake, @Quantity = 3, @IDCart = @LuisCart OUTPUT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Luis, @IDCart = @LuisCart, @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 4, @IDCart = @UserCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cake, @Quantity = 5, @IDCart = @GuestCart OUTPUT;

    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111', @IDCart = @Merged OUTPUT;

    -- 10 en existencia, 3 reservadas por Luis: Ana puede pedir 7 aunque 4 + 5 sumen 9
    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cake);
    EXEC tSQLt.AssertEquals @Expected = 7, @Actual = @Quantity;
END;
GO

CREATE PROCEDURE Test_Cart.[test merging never lowers a quantity the customer already had]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @UserCart INT, @GuestCart INT, @Merged INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 8, @IDCart = @UserCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cake, @Quantity = 2, @IDCart = @GuestCart OUTPUT;
    UPDATE dbo.Variants SET OnHandStock = 3 WHERE IDVariant = @Cake;

    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111', @IDCart = @Merged OUTPUT;

    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cake);
    DECLARE @Flag INT = (SELECT COUNT(*) FROM dbo.CartItems AS ci JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
                         WHERE ci.IDCart = @UserCart AND v.OnHandStock - v.ReservedStock < ci.Quantity);
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @Quantity;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Flag;
END;
GO

CREATE PROCEDURE Test_Cart.[test merging caps a new line and leaves out the one that is sold out]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE'), @Cookie INT = Test_Shop.VariantId(N'B-COOKIE'), @Cupcake INT = Test_Shop.VariantId(N'C-CUPCAKE');
    DECLARE @UserCart INT, @GuestCart INT, @Merged INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 1, @IDCart = @UserCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cookie, @Quantity = 6, @IDCart = @GuestCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cupcake, @Quantity = 2, @IDCart = @GuestCart OUTPUT;
    UPDATE dbo.Variants SET OnHandStock = 4 WHERE IDVariant = @Cookie;
    UPDATE dbo.Variants SET OnHandStock = 0 WHERE IDVariant = @Cupcake;

    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111', @IDCart = @Merged OUTPUT;

    DECLARE @CookieQuantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cookie);
    DECLARE @CupcakeLines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cupcake);
    DECLARE @CakeQuantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cake);
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @CookieQuantity;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @CupcakeLines;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @CakeQuantity;
END;
GO

CREATE PROCEDURE Test_Cart.[test a guest cart adopted by a customer without cart is adjusted to the stock]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cookie INT = Test_Shop.VariantId(N'B-COOKIE'), @Cupcake INT = Test_Shop.VariantId(N'C-CUPCAKE'), @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @GuestCart INT, @Merged INT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cookie, @Quantity = 8, @IDCart = @GuestCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cupcake, @Quantity = 2, @IDCart = @GuestCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cake, @Quantity = 3, @IDCart = @GuestCart OUTPUT;
    UPDATE dbo.Variants SET OnHandStock = 5 WHERE IDVariant = @Cookie;
    UPDATE dbo.Variants SET OnHandStock = 0 WHERE IDVariant = @Cupcake;

    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111', @IDCart = @Merged OUTPUT;

    DECLARE @CookieQuantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @Merged AND IDVariant = @Cookie);
    DECLARE @CupcakeLines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @Merged AND IDVariant = @Cupcake);
    DECLARE @CakeQuantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @Merged AND IDVariant = @Cake);
    DECLARE @Owner INT = (SELECT IDUser FROM dbo.Carts WHERE IDCart = @Merged);
    EXEC tSQLt.AssertEquals @Expected = 5, @Actual = @CookieQuantity;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @CupcakeLines;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @CakeQuantity;
    EXEC tSQLt.AssertEquals @Expected = @Ana, @Actual = @Owner;
END;
GO

CREATE PROCEDURE Test_Cart.[test the available stock function adds back only the reservation of the same cart]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @AnaCart INT, @LuisCart INT, @IDReservation INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 4, @IDCart = @AnaCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Luis, @IDVariant = @Cake, @Quantity = 2, @IDCart = @LuisCart OUTPUT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Ana, @IDCart = @AnaCart, @IDReservation = @IDReservation OUTPUT;

    DECLARE @Own INT = (SELECT Available FROM dbo.FU_Cart_AvailableStock(@AnaCart, @Cake));
    DECLARE @Other INT = (SELECT Available FROM dbo.FU_Cart_AvailableStock(@LuisCart, @Cake));
    DECLARE @NoCart INT = (SELECT Available FROM dbo.FU_Cart_AvailableStock(NULL, @Cake));
    DECLARE @Unknown INT = (SELECT COUNT(*) FROM dbo.FU_Cart_AvailableStock(@AnaCart, -1));
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @Own;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @Other;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @NoCart;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Unknown;
END;
GO

CREATE PROCEDURE Test_Cart.[test the cart totals function returns nothing for a cart that does not exist]
AS
BEGIN
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.FU_Cart_Totals(-1, SYSUTCDATETIME()));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Cart.[test cents are written as text with two decimals]
AS
BEGIN
    DECLARE @Zero NVARCHAR(25) = (SELECT Text FROM dbo.FU_Money_CentsToText(0));
    DECLARE @Small NVARCHAR(25) = (SELECT Text FROM dbo.FU_Money_CentsToText(5));
    DECLARE @Normal NVARCHAR(25) = (SELECT Text FROM dbo.FU_Money_CentsToText(24591));
    DECLARE @Large NVARCHAR(25) = (SELECT Text FROM dbo.FU_Money_CentsToText(999999999999999));
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @Zero;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.05', @Actual = @Small;
    EXEC tSQLt.AssertEqualsString @Expected = N'245.91', @Actual = @Normal;
    EXEC tSQLt.AssertEqualsString @Expected = N'9999999999999.99', @Actual = @Large;
END;
GO

CREATE PROCEDURE Test_Cart.[test the current price function gives cents and whether the variant can be bought]
AS
BEGIN
    DECLARE @C INT = Test_Shop.VariantId(N'C-CUPCAKE');
    DECLARE @Cents BIGINT = (SELECT PriceCents FROM dbo.FU_Catalogue_CurrentPrice(@C));
    DECLARE @Before INT = (SELECT CAST(IsAvailable AS INT) FROM dbo.FU_Catalogue_CurrentPrice(@C));
    UPDATE dbo.Products SET IsActive = 0 WHERE Name = N'Velvet cupcakes';
    DECLARE @After INT = (SELECT CAST(IsAvailable AS INT) FROM dbo.FU_Catalogue_CurrentPrice(@C));
    EXEC tSQLt.AssertEquals @Expected = 5545, @Actual = @Cents;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Before;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @After;
END;
GO

-- Reserva ------------------------------------------------------------------------------------

-- La reserva describe el carrito tal como estaba: si el cliente lo cambia, deja de valer y sus unidades se devuelven
CREATE PROCEDURE Test_Cart.[test changing the cart releases its active reservation]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @A INT = Test_Shop.VariantId(N'A-CAKE'), @B INT = Test_Shop.VariantId(N'B-COOKIE');
    DECLARE @IDCart INT, @IDReservation INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @A, @Quantity = 2, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Ana, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
    DECLARE @HeldBefore INT = (SELECT ReservedStock FROM dbo.Variants WHERE IDVariant = @A);

    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @B, @Quantity = 1, @IDCart = @IDCart OUTPUT;

    DECLARE @HeldAfter INT = (SELECT ReservedStock FROM dbo.Variants WHERE IDVariant = @A);
    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDReservation = @IDReservation);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @HeldBefore;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @HeldAfter;
    EXEC tSQLt.AssertEqualsString @Expected = N'Released', @Actual = @Status;
END;
GO

CREATE PROCEDURE Test_Cart.[test removing a line releases the active reservation]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @A INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @IDCart INT, @IDReservation INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @A, @Quantity = 2, @IDCart = @IDCart OUTPUT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @Ana, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Cart_RemoveItem @IDUser = @Ana, @IDVariant = @A;

    DECLARE @Held INT = (SELECT ReservedStock FROM dbo.Variants WHERE IDVariant = @A);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Held;
END;
GO

-- Fusión -------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Cart.[test a guest cart becomes the cart of a customer who had none]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @GuestCart INT, @Merged INT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cake, @Quantity = 2, @IDCart = @GuestCart OUTPUT;

    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111', @IDCart = @Merged OUTPUT;

    DECLARE @Owner INT = (SELECT IDUser FROM dbo.Carts WHERE IDCart = @GuestCart);
    DECLARE @Token INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDCart = @GuestCart AND GuestToken IS NOT NULL);
    EXEC tSQLt.AssertEquals @Expected = @GuestCart, @Actual = @Merged;
    EXEC tSQLt.AssertEquals @Expected = @Ana, @Actual = @Owner;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Token;
END;
GO

CREATE PROCEDURE Test_Cart.[test merging adds the quantities with a cap of 99 and discards the guest cart]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE'), @Cookie INT = Test_Shop.VariantId(N'B-COOKIE'), @Cupcake INT = Test_Shop.VariantId(N'C-CUPCAKE');
    DECLARE @UserCart INT, @GuestCart INT, @Merged INT;
    -- La fusión suma con tope de 99; para armar 90 + 20 hace falta existencia, que el carrito ahora exige
    UPDATE dbo.Variants SET OnHandStock = 200 WHERE IDVariant = @Cake;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 90, @Inscription = N'Mine', @IDCart = @UserCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cookie, @Quantity = 2, @IDCart = @UserCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cake, @Quantity = 20, @Inscription = N'Guest', @IDCart = @GuestCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cupcake, @Quantity = 4, @IDCart = @GuestCart OUTPUT;

    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111', @IDCart = @Merged OUTPUT;

    DECLARE @CakeQuantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cake);
    DECLARE @CakeInscription NVARCHAR(60) = (SELECT Inscription FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cake);
    DECLARE @CookieQuantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cookie);
    DECLARE @CupcakeQuantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cupcake);
    DECLARE @GuestStatus NVARCHAR(12) = (SELECT Status FROM dbo.Carts WHERE IDCart = @GuestCart);
    DECLARE @GuestLines INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @GuestCart);

    EXEC tSQLt.AssertEquals @Expected = @UserCart, @Actual = @Merged;
    EXEC tSQLt.AssertEquals @Expected = 99, @Actual = @CakeQuantity;
    EXEC tSQLt.AssertEqualsString @Expected = N'Mine', @Actual = @CakeInscription;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @CookieQuantity;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @CupcakeQuantity;
    EXEC tSQLt.AssertEqualsString @Expected = N'Discarded', @Actual = @GuestStatus;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @GuestLines;
END;
GO

CREATE PROCEDURE Test_Cart.[test merging twice changes nothing the second time]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @UserCart INT, @GuestCart INT, @First INT, @Second INT;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 1, @IDCart = @UserCart OUTPUT;
    EXEC dbo.SP_Cart_SetItemQuantity @GuestToken = '11111111-1111-1111-1111-111111111111', @IDVariant = @Cake, @Quantity = 2, @IDCart = @GuestCart OUTPUT;

    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111', @IDCart = @First OUTPUT;
    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '11111111-1111-1111-1111-111111111111', @IDCart = @Second OUTPUT;

    DECLARE @Quantity INT = (SELECT Quantity FROM dbo.CartItems WHERE IDCart = @UserCart AND IDVariant = @Cake);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Quantity;
    EXEC tSQLt.AssertEquals @Expected = @UserCart, @Actual = @Second;
END;
GO

CREATE PROCEDURE Test_Cart.[test merging with no guest cart keeps the cart of the customer]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @UserCart INT, @Merged INT = -1;
    EXEC dbo.SP_Cart_SetItemQuantity @IDUser = @Ana, @IDVariant = @Cake, @Quantity = 1, @IDCart = @UserCart OUTPUT;

    EXEC dbo.SP_Cart_MergeGuest @IDUser = @Ana, @GuestToken = '33333333-3333-3333-3333-333333333333', @IDCart = @Merged OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = @UserCart, @Actual = @Merged;
END;
GO

CREATE PROCEDURE Test_Cart.[test merging needs both the user and the token]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Cart_MergeGuest @IDUser = NULL, @GuestToken = '11111111-1111-1111-1111-111111111111';
END;
GO
