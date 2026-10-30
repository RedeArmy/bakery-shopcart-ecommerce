/* =====================================================================
   Objeto   : Test_Inventory (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Reserva atómica de stock: reglas de negocio, errores y liberación
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). La carrera real entre conexiones no se puede
              probar dentro de una transacción de tSQLt: la cubre npm run sql:concurrency (db/tests/scripts/run-concurrency.ts).
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Inventory';
GO

-- Cliente del fixture con un carrito activo de 2 unidades de FIXTURE-SKU, que tiene 5 en existencia
CREATE PROCEDURE Test_Inventory.SetUp
AS
BEGIN
    EXEC Test_Fixtures.CreateBaseData;

    -- La ventana viene de la semilla de configuración; se asegura por si la prueba corre sin semillas
    IF NOT EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'ReservationMinutes')
        INSERT INTO dbo.Configuration (SettingKey, SettingValue) VALUES (N'ReservationMinutes', N'15');

    INSERT INTO dbo.Carts (IDUser, Status)
    SELECT IDUser, N'Active' FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test';

    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity)
    SELECT c.IDCart, v.IDVariant, 2
    FROM dbo.Carts AS c
    JOIN dbo.Users AS u ON u.IDUser = c.IDUser AND u.Email = N'fixture.customer@shopcart.test'
    CROSS JOIN dbo.Variants AS v
    WHERE v.SKU = N'FIXTURE-SKU';
END;
GO

-- Reservar ----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Inventory.[test reserving a cart holds its units and sets the expiry from the configured window]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @Now DATETIME2(3) = '2030-01-01T10:00:00';
    DECLARE @Minutes INT = (SELECT CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'ReservationMinutes');
    DECLARE @IDReservation INT, @ExpiresAt DATETIME2(3);

    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @Now = @Now,
         @IDReservation = @IDReservation OUTPUT, @ExpiresAt = @ExpiresAt OUTPUT;

    DECLARE @Reserved INT = (SELECT ReservedStock FROM dbo.Variants WHERE SKU = N'FIXTURE-SKU');
    DECLARE @LineQuantity INT = (SELECT Quantity FROM dbo.ReservationLines WHERE IDReservation = @IDReservation);
    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDReservation = @IDReservation);

    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Reserved;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @LineQuantity;
    EXEC tSQLt.AssertEqualsString @Expected = N'Active', @Actual = @Status;
    -- tSQLt no admite expresiones como argumento: se convierten antes a texto
    DECLARE @ExpectedExpiry VARCHAR(23) = CONVERT(VARCHAR(23), DATEADD(MINUTE, @Minutes, @Now), 121);
    DECLARE @ActualExpiry VARCHAR(23) = CONVERT(VARCHAR(23), @ExpiresAt, 121);
    EXEC tSQLt.AssertEqualsString @Expected = @ExpectedExpiry, @Actual = @ActualExpiry;
END;
GO

-- Reintento del pago: no se retienen las unidades dos veces
CREATE PROCEDURE Test_Inventory.[test reserving the same cart again replaces the previous reservation]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;

    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;

    DECLARE @Reserved INT = (SELECT ReservedStock FROM dbo.Variants WHERE SKU = N'FIXTURE-SKU');
    DECLARE @Active INT = (SELECT COUNT(*) FROM dbo.Reservations WHERE IDCart = @IDCart AND Status = N'Active');
    DECLARE @Released INT = (SELECT COUNT(*) FROM dbo.Reservations WHERE IDCart = @IDCart AND Status = N'Released');

    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Reserved;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Released;
END;
GO

-- Se pueden reservar exactamente las unidades que quedan, ni una más
CREATE PROCEDURE Test_Inventory.[test the last available units can be reserved]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    UPDATE dbo.CartItems SET Quantity = 5 WHERE IDCart = @IDCart;

    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;

    DECLARE @Reserved INT = (SELECT ReservedStock FROM dbo.Variants WHERE SKU = N'FIXTURE-SKU');
    EXEC tSQLt.AssertEquals @Expected = 5, @Actual = @Reserved;
END;
GO

CREATE PROCEDURE Test_Inventory.[test asking for more than the stock raises a conflict]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    UPDATE dbo.CartItems SET Quantity = 6 WHERE IDCart = @IDCart;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%no longer available%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
END;
GO

-- Lo que otros ya reservaron no está disponible aunque haya existencia física
CREATE PROCEDURE Test_Inventory.[test units held by other reservations are not available]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    UPDATE dbo.Variants SET ReservedStock = 4 WHERE SKU = N'FIXTURE-SKU';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%no longer available%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
END;
GO

CREATE PROCEDURE Test_Inventory.[test an inactive variant cannot be reserved]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    UPDATE dbo.Variants SET IsActive = 0 WHERE SKU = N'FIXTURE-SKU';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%no longer available%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
END;
GO

CREATE PROCEDURE Test_Inventory.[test an empty cart cannot be reserved]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    DELETE FROM dbo.CartItems WHERE IDCart = @IDCart;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%cart is empty%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
END;
GO

-- Anti-IDOR: el carrito de otra persona responde igual que uno inexistente
CREATE PROCEDURE Test_Inventory.[test another customer's cart answers not found]
AS
BEGIN
    DECLARE @IDCart INT = (SELECT TOP (1) IDCart FROM dbo.Carts);
    DECLARE @IDReservation INT;
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (1, N'fixture.intruder@shopcart.test', N'not-a-real-hash', N'Fixture Intruder');
    DECLARE @IDIntruder INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.intruder@shopcart.test');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Cart not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDIntruder, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
END;
GO

CREATE PROCEDURE Test_Inventory.[test a cart that does not exist answers not found]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDReservation INT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Cart not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = -1, @IDReservation = @IDReservation OUTPUT;
END;
GO

-- Un carrito ya convertido en pedido no vuelve a reservar
CREATE PROCEDURE Test_Inventory.[test a converted cart answers not found]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    UPDATE dbo.Carts SET Status = N'Converted' WHERE IDCart = @IDCart;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Cart not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
END;
GO

CREATE PROCEDURE Test_Inventory.[test missing identifiers are rejected as invalid parameters]
AS
BEGIN
    DECLARE @IDReservation INT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = NULL, @IDCart = NULL, @IDReservation = @IDReservation OUTPUT;
END;
GO

CREATE PROCEDURE Test_Inventory.[test a missing reservation window stops the reservation]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    DELETE FROM dbo.Configuration WHERE SettingKey = N'ReservationMinutes';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%window is not configured%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
END;
GO

-- Segunda línea de defensa: aunque un procedimiento defectuoso lo intentara, los datos lo rechazan
CREATE PROCEDURE Test_Inventory.[test the data refuse a second active reservation for the same cart]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    INSERT INTO dbo.Reservations (IDCart, IDUser, Status, ExpiresAt) VALUES (@IDCart, @IDUser, N'Active', '2030-01-01');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%UX_Reservations_OneActivePerCart%', @ExpectedErrorNumber = 2601;
    INSERT INTO dbo.Reservations (IDCart, IDUser, Status, ExpiresAt) VALUES (@IDCart, @IDUser, N'Active', '2030-01-02');
END;
GO

-- Liberar ----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Inventory.[test releasing a cart returns its units and is harmless when repeated]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @IDUser, @IDCart = @IDCart;
    EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @IDUser, @IDCart = @IDCart;

    DECLARE @Reserved INT = (SELECT ReservedStock FROM dbo.Variants WHERE SKU = N'FIXTURE-SKU');
    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDReservation = @IDReservation);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Reserved;
    EXEC tSQLt.AssertEqualsString @Expected = N'Released', @Actual = @Status;
END;
GO

-- Con pedido, las unidades las conserva el pedido: un reintento del checkout no debe liberarlas
CREATE PROCEDURE Test_Inventory.[test releasing a cart leaves a reservation linked to an order]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDCart INT = (SELECT IDCart FROM dbo.Carts WHERE IDUser = @IDUser);
    DECLARE @IDReservation INT;
    EXEC dbo.SP_Inventory_ReserveStock @IDUser = @IDUser, @IDCart = @IDCart, @IDReservation = @IDReservation OUTPUT;
    UPDATE dbo.Reservations SET IDOrder = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001')
    WHERE IDReservation = @IDReservation;

    EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @IDUser, @IDCart = @IDCart;

    DECLARE @Reserved INT = (SELECT ReservedStock FROM dbo.Variants WHERE SKU = N'FIXTURE-SKU');
    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDReservation = @IDReservation);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Reserved;
    EXEC tSQLt.AssertEqualsString @Expected = N'Active', @Actual = @Status;
END;
GO

CREATE PROCEDURE Test_Inventory.[test releasing another customer's cart answers not found]
AS
BEGIN
    DECLARE @IDCart INT = (SELECT TOP (1) IDCart FROM dbo.Carts);
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (1, N'fixture.intruder@shopcart.test', N'not-a-real-hash', N'Fixture Intruder');
    DECLARE @IDIntruder INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.intruder@shopcart.test');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Cart not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Inventory_ReleaseCartReservation @IDUser = @IDIntruder, @IDCart = @IDCart;
END;
GO

-- Expirar ------------------------------------------------------------------------------------

-- Tres reservas de 1 unidad: vencida sin pedido (se libera), vigente (se queda) y vencida con pedido (la gobierna el pago)
CREATE PROCEDURE Test_Inventory.[test the expiry releases only expired reservations that have no order]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'fixture.customer@shopcart.test');
    DECLARE @IDVariant INT = (SELECT IDVariant FROM dbo.Variants WHERE SKU = N'FIXTURE-SKU');
    DECLARE @IDOrder INT = (SELECT IDOrder FROM dbo.Orders WHERE OrderNumber = N'FIX-0001');
    DECLARE @Now DATETIME2(3) = '2030-01-01T12:00:00';

    -- Una reserva por carrito: la segunda línea de defensa impide dos activas en el mismo carrito
    INSERT INTO dbo.Carts (GuestToken, Status) VALUES (NEWID(), N'Active'), (NEWID(), N'Active'), (NEWID(), N'Active');
    DECLARE @Carts TABLE (Position INT IDENTITY(1,1), IDCart INT);
    INSERT INTO @Carts (IDCart) SELECT IDCart FROM dbo.Carts WHERE IDUser IS NULL ORDER BY IDCart;

    INSERT INTO dbo.Reservations (IDCart, IDUser, IDOrder, Status, ExpiresAt)
    SELECT c.IDCart, @IDUser, x.IDOrder, N'Active', x.ExpiresAt
    FROM @Carts AS c
    JOIN (VALUES (1, CAST(NULL AS INT), CAST('2030-01-01T11:00:00' AS DATETIME2(3))),
                 (2, CAST(NULL AS INT), CAST('2030-01-01T13:00:00' AS DATETIME2(3))),
                 (3, @IDOrder,          CAST('2030-01-01T11:00:00' AS DATETIME2(3)))) AS x (Position, IDOrder, ExpiresAt)
      ON x.Position = c.Position;
    INSERT INTO dbo.ReservationLines (IDReservation, IDVariant, Quantity)
    SELECT IDReservation, @IDVariant, 1 FROM dbo.Reservations;
    UPDATE dbo.Variants SET ReservedStock = 3 WHERE IDVariant = @IDVariant;

    CREATE TABLE #Result (ReleasedReservations INT);
    INSERT INTO #Result EXEC dbo.SP_Inventory_ReleaseExpiredReservations @Now = @Now;

    DECLARE @Released INT = (SELECT ReleasedReservations FROM #Result);
    DECLARE @Reserved INT = (SELECT ReservedStock FROM dbo.Variants WHERE IDVariant = @IDVariant);
    DECLARE @Expired INT = (SELECT COUNT(*) FROM dbo.Reservations WHERE Status = N'Expired');
    DECLARE @StillActive INT = (SELECT COUNT(*) FROM dbo.Reservations WHERE Status = N'Active');

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Released;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Reserved;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Expired;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @StillActive;
END;
GO

CREATE PROCEDURE Test_Inventory.[test the expiry does nothing when no reservation has expired]
AS
BEGIN
    CREATE TABLE #Result (ReleasedReservations INT);
    INSERT INTO #Result EXEC dbo.SP_Inventory_ReleaseExpiredReservations @Now = '2030-01-01T12:00:00';

    DECLARE @Released INT = (SELECT ReleasedReservations FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Released;
END;
GO
