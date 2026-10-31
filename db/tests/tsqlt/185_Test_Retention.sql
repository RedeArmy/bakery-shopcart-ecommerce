/* =====================================================================
   Objeto   : Test_Retention (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Purga por lotes de las tablas que solo crecen y la lectura de sus plazos de Configuration
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Retention';
GO

CREATE PROCEDURE Test_Retention.SetUp
AS
BEGIN
    EXEC Test_Lifecycle.SetUp;
    -- El historial de DDL real de las migraciones tiene fecha de hoy: con un reloj de prueba en 2030 también vencería
    DELETE FROM dbo.DdlHistory;
END;
GO

-- Lectura de los plazos ----------------------------------------------------------------------

CREATE PROCEDURE Test_Retention.[test a configured integer is read and anything unusable falls back to the default]
AS
BEGIN
    DELETE FROM dbo.Configuration WHERE SettingKey LIKE N'Probe%';
    INSERT INTO dbo.Configuration (SettingKey, SettingValue) VALUES
        (N'ProbeGood', N'7'), (N'ProbeText', N'abc'), (N'ProbeZero', N'0'), (N'ProbeNegative', N'-5'), (N'ProbeBlank', N'');

    DECLARE @Good INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'ProbeGood', 30));
    DECLARE @Text INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'ProbeText', 30));
    DECLARE @Zero INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'ProbeZero', 30));
    DECLARE @Negative INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'ProbeNegative', 30));
    DECLARE @Blank INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'ProbeBlank', 30));
    DECLARE @Missing INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'ProbeMissing', 30));
    EXEC tSQLt.AssertEquals @Expected = 7, @Actual = @Good;
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Text;
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Zero;
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Negative;
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Blank;
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Missing;
END;
GO

CREATE PROCEDURE Test_Retention.[test the retention periods are seeded]
AS
BEGIN
    DECLARE @Tokens INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionRefreshTokenDays', -1));
    DECLARE @Webhooks INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionWebhookDays', -1));
    DECLARE @Carts INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionGuestCartDays', -1));
    DECLARE @Reservations INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionReservationDays', -1));
    DECLARE @Ddl INT = (SELECT Value FROM dbo.FU_Configuration_PositiveInteger(N'RetentionDdlHistoryDays', -1));
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Tokens;
    EXEC tSQLt.AssertEquals @Expected = 90, @Actual = @Webhooks;
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Carts;
    EXEC tSQLt.AssertEquals @Expected = 90, @Actual = @Reservations;
    EXEC tSQLt.AssertEquals @Expected = 365, @Actual = @Ddl;
END;
GO

-- Tokens de refresco -------------------------------------------------------------------------

-- Una familia se borra entera o no se toca: IDReplacedBy apunta de cada token al que lo reemplazó
CREATE PROCEDURE Test_Retention.[test a family whose tokens all expired long ago is deleted whole, chain included]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Old UNIQUEIDENTIFIER = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', @Mixed UNIQUEIDENTIFIER = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
            @Recent UNIQUEIDENTIFIER = 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC';
    DECLARE @First BIGINT, @Second BIGINT, @Third BIGINT;
    -- Familia vieja: tres tokens encadenados, todos vencidos hace más de 30 días
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt, RevokedAt) VALUES (@Ana, @Old, REPLICATE('a', 63) + '1', '2029-10-01', '2029-09-25');
    SET @First = SCOPE_IDENTITY();
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt, RevokedAt) VALUES (@Ana, @Old, REPLICATE('a', 63) + '2', '2029-10-05', '2029-09-30');
    SET @Second = SCOPE_IDENTITY();
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES (@Ana, @Old, REPLICATE('a', 63) + '3', '2029-10-10');
    SET @Third = SCOPE_IDENTITY();
    UPDATE dbo.RefreshTokens SET IDReplacedBy = @Second WHERE IDRefreshToken = @First;
    UPDATE dbo.RefreshTokens SET IDReplacedBy = @Third WHERE IDRefreshToken = @Second;
    -- Familia mixta: un token viejo y otro todavía vigente
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES
        (@Ana, @Mixed, REPLICATE('b', 63) + '1', '2029-01-01'), (@Ana, @Mixed, REPLICATE('b', 63) + '2', '2030-01-05');
    -- Familia que venció hace 5 días: dentro del plazo de 30
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES (@Ana, @Recent, REPLICATE('c', 63) + '1', '2029-12-27');

    DECLARE @Tokens INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @PurgedRefreshTokens = @Tokens OUTPUT;

    DECLARE @OldLeft INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDFamily = @Old);
    DECLARE @MixedLeft INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDFamily = @Mixed);
    DECLARE @RecentLeft INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDFamily = @Recent);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Tokens;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OldLeft;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @MixedLeft;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @RecentLeft;
END;
GO

-- Con lotes más pequeños que la familia, la cadena IDReplacedBy se borra en orden y la clave foránea no falla
CREATE PROCEDURE Test_Retention.[test a family split across batches is deleted in an order the foreign key accepts]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Family UNIQUEIDENTIFIER = 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD';
    DECLARE @A BIGINT, @B BIGINT, @C BIGINT, @D BIGINT;
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES (@Ana, @Family, REPLICATE('d', 63) + '1', '2029-06-01');
    SET @A = SCOPE_IDENTITY();
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES (@Ana, @Family, REPLICATE('d', 63) + '2', '2029-06-02');
    SET @B = SCOPE_IDENTITY();
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES (@Ana, @Family, REPLICATE('d', 63) + '3', '2029-06-03');
    SET @C = SCOPE_IDENTITY();
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES (@Ana, @Family, REPLICATE('d', 63) + '4', '2029-06-04');
    SET @D = SCOPE_IDENTITY();
    UPDATE dbo.RefreshTokens SET IDReplacedBy = @B WHERE IDRefreshToken = @A;
    UPDATE dbo.RefreshTokens SET IDReplacedBy = @C WHERE IDRefreshToken = @B;
    UPDATE dbo.RefreshTokens SET IDReplacedBy = @D WHERE IDRefreshToken = @C;

    -- Lotes de uno: cuatro vueltas, una por token
    DECLARE @Tokens INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @BatchSize = 1, @MaxBatches = 10, @PurgedRefreshTokens = @Tokens OUTPUT;

    DECLARE @Left INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDFamily = @Family);
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Tokens;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Left;
END;
GO

-- Webhooks y DDL -----------------------------------------------------------------------------

CREATE PROCEDURE Test_Retention.[test old webhooks and old DDL history are deleted and recent ones kept]
AS
BEGIN
    INSERT INTO dbo.ReceivedWebhooks (Provider, MessageId, EventType, Payload, ReceivedAt) VALUES
        (N'Recurrente', N'old', N'x', N'{}', '2029-09-01'), (N'Recurrente', N'recent', N'x', N'{}', '2029-12-20');
    INSERT INTO dbo.DdlHistory (EventName, ObjectName, UserName, CreatedAt) VALUES
        (N'ALTER_PROCEDURE', N'RetentionProbeOld', N'sa', '2028-12-01'), (N'ALTER_PROCEDURE', N'RetentionProbeRecent', N'sa', '2029-11-01');

    DECLARE @Webhooks INT, @Ddl INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @PurgedWebhooks = @Webhooks OUTPUT, @PurgedDdlHistory = @Ddl OUTPUT;

    DECLARE @WebhooksLeft NVARCHAR(100) = (SELECT STRING_AGG(MessageId, N',') FROM dbo.ReceivedWebhooks);
    DECLARE @DdlLeft NVARCHAR(200) = (SELECT STRING_AGG(ObjectName, N',') FROM dbo.DdlHistory WHERE ObjectName LIKE N'RetentionProbe%');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Webhooks;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Ddl;
    EXEC tSQLt.AssertEqualsString @Expected = N'recent', @Actual = @WebhooksLeft;
    EXEC tSQLt.AssertEqualsString @Expected = N'RetentionProbeRecent', @Actual = @DdlLeft;
END;
GO

CREATE PROCEDURE Test_Retention.[test a shorter period in the configuration purges more]
AS
BEGIN
    INSERT INTO dbo.ReceivedWebhooks (Provider, MessageId, EventType, Payload, ReceivedAt) VALUES
        (N'Recurrente', N'twelve-days-old', N'x', N'{}', '2029-12-20');
    UPDATE dbo.Configuration SET SettingValue = N'7' WHERE SettingKey = N'RetentionWebhookDays';

    DECLARE @Webhooks INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @PurgedWebhooks = @Webhooks OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Webhooks;
END;
GO

-- Carritos de visitante ----------------------------------------------------------------------

CREATE PROCEDURE Test_Retention.[test only idle guest carts are deleted, with their lines, and the carts of customers are kept]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @OldGuest INT, @RecentGuest INT, @OldCustomer INT;
    INSERT INTO dbo.Carts (GuestToken, Status, CreatedAt, LastActivityAt) VALUES (NEWID(), N'Active', '2029-10-01', '2029-10-01');
    SET @OldGuest = SCOPE_IDENTITY();
    INSERT INTO dbo.Carts (GuestToken, Status, CreatedAt, LastActivityAt) VALUES (NEWID(), N'Active', '2029-12-30', '2029-12-30');
    SET @RecentGuest = SCOPE_IDENTITY();
    INSERT INTO dbo.Carts (IDUser, Status, CreatedAt, LastActivityAt) VALUES (@Ana, N'Active', '2029-01-01', '2029-01-01');
    SET @OldCustomer = SCOPE_IDENTITY();
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity) VALUES (@OldGuest, @Cake, 2), (@RecentGuest, @Cake, 1), (@OldCustomer, @Cake, 3);

    DECLARE @Carts INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @PurgedGuestCarts = @Carts OUTPUT;

    DECLARE @OldGuestLeft INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDCart = @OldGuest);
    DECLARE @OldGuestItems INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart = @OldGuest);
    DECLARE @Kept INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDCart IN (@RecentGuest, @OldCustomer));
    DECLARE @KeptItems INT = (SELECT COUNT(*) FROM dbo.CartItems WHERE IDCart IN (@RecentGuest, @OldCustomer));
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Carts;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OldGuestLeft;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OldGuestItems;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Kept;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @KeptItems;
END;
GO

-- Reservas -----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Retention.[test old released reservations without an order are deleted and the others are kept]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    DECLARE @Cake INT = Test_Shop.VariantId(N'A-CAKE');
    DECLARE @CartOld INT, @CartActive INT, @CartRecent INT;
    -- Tres carritos de clientes distintos de estado: no se fusionan ni se reservan entre sí
    INSERT INTO dbo.Carts (IDUser, Status, LastActivityAt) VALUES (@Ana, N'Discarded', '2029-01-01');
    SET @CartOld = SCOPE_IDENTITY();
    INSERT INTO dbo.Carts (IDUser, Status, LastActivityAt) VALUES (@Luis, N'Active', '2029-01-01');
    SET @CartActive = SCOPE_IDENTITY();
    INSERT INTO dbo.Carts (IDUser, Status, LastActivityAt) VALUES (@Ana, N'Discarded', '2029-12-25');
    SET @CartRecent = SCOPE_IDENTITY();

    DECLARE @Old INT, @Active INT, @Recent INT;
    INSERT INTO dbo.Reservations (IDCart, IDUser, Status, CreatedAt, ExpiresAt) VALUES (@CartOld, @Ana, N'Released', '2029-05-01', '2029-05-01');
    SET @Old = SCOPE_IDENTITY();
    INSERT INTO dbo.Reservations (IDCart, IDUser, Status, CreatedAt, ExpiresAt) VALUES (@CartActive, @Luis, N'Active', '2029-05-01', '2029-05-01');
    SET @Active = SCOPE_IDENTITY();
    INSERT INTO dbo.Reservations (IDCart, IDUser, Status, CreatedAt, ExpiresAt) VALUES (@CartRecent, @Ana, N'Expired', '2029-12-25', '2029-12-25');
    SET @Recent = SCOPE_IDENTITY();
    INSERT INTO dbo.ReservationLines (IDReservation, IDVariant, Quantity) VALUES (@Old, @Cake, 1), (@Active, @Cake, 1), (@Recent, @Cake, 1);
    UPDATE dbo.Variants SET ReservedStock = 1 WHERE IDVariant = @Cake;

    DECLARE @Reservations INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @PurgedReservations = @Reservations OUTPUT;

    DECLARE @OldLeft INT = (SELECT COUNT(*) + (SELECT COUNT(*) FROM dbo.ReservationLines WHERE IDReservation = @Old) FROM dbo.Reservations WHERE IDReservation = @Old);
    DECLARE @Kept INT = (SELECT COUNT(*) FROM dbo.Reservations WHERE IDReservation IN (@Active, @Recent));
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Reservations;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OldLeft;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Kept;
END;
GO

-- Una reserva que pertenece a un pedido es parte de su historia, por vieja que sea
CREATE PROCEDURE Test_Retention.[test an old reservation that belongs to an order is kept]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    UPDATE dbo.Reservations SET Status = N'Released', ExpiresAt = '2029-01-01' WHERE IDOrder = @IDOrder;

    DECLARE @Reservations INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @PurgedReservations = @Reservations OUTPUT;

    DECLARE @Left INT = (SELECT COUNT(*) FROM dbo.Reservations WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Reservations;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Left;
END;
GO

-- Lotes, repetición y parámetros -------------------------------------------------------------

CREATE PROCEDURE Test_Retention.[test the batch size and the batch limit cap what one run deletes and the next run continues]
AS
BEGIN
    INSERT INTO dbo.ReceivedWebhooks (Provider, MessageId, EventType, Payload, ReceivedAt)
    SELECT N'Recurrente', CONCAT(N'm', n), N'x', N'{}', '2029-01-01' FROM (VALUES (1), (2), (3), (4), (5)) AS t (n);

    DECLARE @First INT, @Second INT, @Third INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @BatchSize = 2, @MaxBatches = 2, @PurgedWebhooks = @First OUTPUT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @BatchSize = 2, @MaxBatches = 2, @PurgedWebhooks = @Second OUTPUT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @BatchSize = 2, @MaxBatches = 2, @PurgedWebhooks = @Third OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Third;
END;
GO

CREATE PROCEDURE Test_Retention.[test a run with nothing to purge reports zeros and changes nothing]
AS
BEGIN
    DECLARE @Tokens INT, @Webhooks INT, @Carts INT, @Reservations INT, @Ddl INT;
    EXEC dbo.SP_Retention_Purge @Now = '2030-01-01T12:00:00', @PurgedRefreshTokens = @Tokens OUTPUT, @PurgedWebhooks = @Webhooks OUTPUT,
         @PurgedGuestCarts = @Carts OUTPUT, @PurgedReservations = @Reservations OUTPUT, @PurgedDdlHistory = @Ddl OUTPUT;

    DECLARE @Total INT = @Tokens + @Webhooks + @Carts + @Reservations + @Ddl;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Retention.[test invalid batch parameters are rejected]
AS
BEGIN
    DECLARE @ZeroBatch INT = 0, @HugeBatch INT = 0, @ZeroLimit INT = 0, @HugeLimit INT = 0;
    BEGIN TRY EXEC dbo.SP_Retention_Purge @BatchSize = 0; END TRY BEGIN CATCH SET @ZeroBatch = ERROR_NUMBER(); END CATCH;
    BEGIN TRY EXEC dbo.SP_Retention_Purge @BatchSize = 10001; END TRY BEGIN CATCH SET @HugeBatch = ERROR_NUMBER(); END CATCH;
    BEGIN TRY EXEC dbo.SP_Retention_Purge @MaxBatches = 0; END TRY BEGIN CATCH SET @ZeroLimit = ERROR_NUMBER(); END CATCH;
    BEGIN TRY EXEC dbo.SP_Retention_Purge @MaxBatches = 1001; END TRY BEGIN CATCH SET @HugeLimit = ERROR_NUMBER(); END CATCH;

    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @ZeroBatch;
    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @HugeBatch;
    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @ZeroLimit;
    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @HugeLimit;
END;
GO

-- El job ejecuta la purga de retención junto con la de idempotencia y devuelve sus cifras
CREATE PROCEDURE Test_Retention.[test the purge job reports what the retention purge deleted]
AS
BEGIN
    INSERT INTO dbo.ReceivedWebhooks (Provider, MessageId, EventType, Payload, ReceivedAt) VALUES (N'Recurrente', N'old', N'x', N'{}', '2029-01-01');
    INSERT INTO dbo.Carts (GuestToken, Status, CreatedAt, LastActivityAt) VALUES (NEWID(), N'Active', '2029-01-01', '2029-01-01');

    DECLARE @Outcome VARCHAR(10), @Idempotency INT, @Tokens INT, @Webhooks INT, @Carts INT, @Reservations INT, @Ddl INT;
    EXEC dbo.SP_Jobs_PurgeExpired @Now = '2030-01-01T12:00:00', @Outcome = @Outcome OUTPUT, @PurgedIdempotency = @Idempotency OUTPUT,
         @PurgedRefreshTokens = @Tokens OUTPUT, @PurgedWebhooks = @Webhooks OUTPUT, @PurgedGuestCarts = @Carts OUTPUT,
         @PurgedReservations = @Reservations OUTPUT, @PurgedDdlHistory = @Ddl OUTPUT;

    EXEC tSQLt.AssertEqualsString @Expected = N'Ran', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Webhooks;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Carts;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Tokens;
END;
GO
