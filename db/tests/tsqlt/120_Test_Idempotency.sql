/* =====================================================================
   Objeto   : Test_Idempotency (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Idempotencia de primer nivel: llave nueva, reproducción, en proceso, cuerpo distinto, abandono, fallo y purga
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). La carrera de solicitudes simultáneas con la misma
              llave la cubre npm run sql:concurrency.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Idempotency';
GO

CREATE PROCEDURE Test_Idempotency.SetUp
AS
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'IdempotencyKeyHours')
        INSERT INTO dbo.Configuration VALUES (N'IdempotencyKeyHours', N'24');
END;
GO

-- Atajo: una solicitud típica de confirmación de compra, para no repetir seis argumentos en cada prueba. Devuelve la fila
-- de resultado en #Result, que la prueba crea con las mismas columnas.
CREATE PROCEDURE Test_Idempotency.Begin_
    @Key NVARCHAR(64) = N'key-1',
    @Hash CHAR(64) = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    @Now DATETIME2(3) = '2030-01-01T10:00:00',
    @Scope NVARCHAR(64) = N'U:7',
    @Route NVARCHAR(200) = N'/checkout/confirm'
AS
BEGIN
    INSERT INTO #Result EXEC dbo.SP_Idempotency_Begin @Scope = @Scope, @Method = N'POST', @Route = @Route,
         @IdempotencyKey = @Key, @RequestHash = @Hash, @Now = @Now;
END;
GO

-- Llave nueva -------------------------------------------------------------------------------

CREATE PROCEDURE Test_Idempotency.[test a new key starts the request and stores it in progress until the retention expires]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_;

    DECLARE @Outcome VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    DECLARE @Expires VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), ExpiresAt, 121) FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    EXEC tSQLt.AssertEqualsString @Expected = 'New', @Actual = @Outcome;
    EXEC tSQLt.AssertEqualsString @Expected = N'InProgress', @Actual = @Status;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-01-02 10:00:00.000', @Actual = @Expires;   -- 24 horas de la configuración
END;
GO

-- En proceso --------------------------------------------------------------------------------

CREATE PROCEDURE Test_Idempotency.[test the same key with the same body while in progress says to wait and for how long]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:00:00';
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:00:20';

    DECLARE @Outcome VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @Wait INT = (SELECT RetryAfterSeconds FROM #Result);
    EXEC tSQLt.AssertEqualsString @Expected = 'InProgress', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 40, @Actual = @Wait;   -- 60 s menos los 20 que lleva
END;
GO

-- Una solicitud en proceso desde hace más de 60 s se da por abandonada y otra instancia la toma
CREATE PROCEDURE Test_Idempotency.[test a request in progress for sixty seconds is taken over and the clock restarts]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:00:00';
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:01:00';
    DECLARE @TakenOver VARCHAR(12) = (SELECT Outcome FROM #Result);
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:01:10';
    DECLARE @Afterwards VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @Wait INT = (SELECT RetryAfterSeconds FROM #Result);

    EXEC tSQLt.AssertEqualsString @Expected = 'TakenOver', @Actual = @TakenOver;
    EXEC tSQLt.AssertEqualsString @Expected = 'InProgress', @Actual = @Afterwards;   -- el reloj de la nueva instancia empieza de cero
    EXEC tSQLt.AssertEquals @Expected = 50, @Actual = @Wait;
END;
GO

-- Completada y reproducción -----------------------------------------------------------------

CREATE PROCEDURE Test_Idempotency.[test a completed request replays the stored response exactly]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    DECLARE @Stored BIT;
    EXEC Test_Idempotency.Begin_;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 201, @ResponseBody = N'{"orderNumber":"SC-0001","total":"220.91"}', @Stored = @Stored OUTPUT;
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:05:00';

    DECLARE @Outcome VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @HttpStatus INT = (SELECT HttpStatus FROM #Result);
    DECLARE @Body NVARCHAR(MAX) = (SELECT ResponseBody FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Stored;
    EXEC tSQLt.AssertEqualsString @Expected = 'Replay', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 201, @Actual = @HttpStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'{"orderNumber":"SC-0001","total":"220.91"}', @Actual = @Body;
END;
GO

CREATE PROCEDURE Test_Idempotency.[test a deterministic client error is stored and replayed too]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    DECLARE @Stored BIT;
    EXEC Test_Idempotency.Begin_;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 422, @ResponseBody = N'{"error":{"code":"COUPON_EXPIRED"}}', @Stored = @Stored OUTPUT;
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:05:00';

    DECLARE @Outcome VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @HttpStatus INT = (SELECT HttpStatus FROM #Result);
    EXEC tSQLt.AssertEqualsString @Expected = 'Replay', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 422, @Actual = @HttpStatus;
END;
GO

-- Cuerpo distinto ---------------------------------------------------------------------------

CREATE PROCEDURE Test_Idempotency.[test the same key with another body is a mismatch whether in progress or completed]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    DECLARE @Stored BIT;
    EXEC Test_Idempotency.Begin_;
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    DECLARE @WhileRunning VARCHAR(12) = (SELECT Outcome FROM #Result);
    DELETE FROM #Result;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 200, @ResponseBody = N'{}', @Stored = @Stored OUTPUT;
    EXEC Test_Idempotency.Begin_ @Hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    DECLARE @AfterCompleting VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @Body NVARCHAR(MAX) = (SELECT ResponseBody FROM #Result);

    EXEC tSQLt.AssertEqualsString @Expected = 'Mismatch', @Actual = @WhileRunning;
    EXEC tSQLt.AssertEqualsString @Expected = 'Mismatch', @Actual = @AfterCompleting;
    DECLARE @LeakedBody INT = CASE WHEN @Body IS NULL THEN 0 ELSE 1 END;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @LeakedBody;   -- ni siquiera se filtra la respuesta guardada
END;
GO

-- Alcance -----------------------------------------------------------------------------------

-- Una llave de un cliente no choca con la de otro, ni con la de la misma persona en otra ruta
CREATE PROCEDURE Test_Idempotency.[test the same key of another user or another route is independent]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_;
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Scope = N'U:8';
    EXEC Test_Idempotency.Begin_ @Route = N'/returns';
    EXEC Test_Idempotency.Begin_ @Scope = N'G:11111111-1111-1111-1111-111111111111';

    DECLARE @News INT = (SELECT COUNT(*) FROM #Result WHERE Outcome = 'New');
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.IdempotentRequests);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @News;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Rows;
END;
GO

-- Fallo y reintento -------------------------------------------------------------------------

CREATE PROCEDURE Test_Idempotency.[test a failed request can be retried with the same key and body]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_;
    EXEC dbo.SP_Idempotency_Fail @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1';
    DECLARE @Failed NVARCHAR(12) = (SELECT Status FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:00:05';

    DECLARE @Outcome VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    EXEC tSQLt.AssertEqualsString @Expected = N'Failed', @Actual = @Failed;
    EXEC tSQLt.AssertEqualsString @Expected = 'New', @Actual = @Outcome;   -- se reintenta sin esperar los 60 s
    EXEC tSQLt.AssertEqualsString @Expected = N'InProgress', @Actual = @Status;
END;
GO

CREATE PROCEDURE Test_Idempotency.[test failing never overwrites a stored response and an unknown key is harmless]
AS
BEGIN
    DECLARE @Stored BIT;
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 200, @ResponseBody = N'{"ok":true}', @Stored = @Stored OUTPUT;

    EXEC dbo.SP_Idempotency_Fail @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1';
    EXEC dbo.SP_Idempotency_Fail @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'unknown';

    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    EXEC tSQLt.AssertEqualsString @Expected = N'Completed', @Actual = @Status;
END;
GO

-- Vencida -----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Idempotency.[test an expired key that was not purged yet is treated as new even with another body]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    DECLARE @Stored BIT;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:00:00';
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 200, @ResponseBody = N'{"old":true}', @Stored = @Stored OUTPUT;
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-02T10:00:01', @Hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    DECLARE @Outcome VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    DECLARE @Body NVARCHAR(MAX) = (SELECT ResponseBody FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.IdempotentRequests);
    EXEC tSQLt.AssertEqualsString @Expected = 'New', @Actual = @Outcome;
    EXEC tSQLt.AssertEqualsString @Expected = N'InProgress', @Actual = @Status;
    DECLARE @OldBody INT = CASE WHEN @Body IS NULL THEN 0 ELSE 1 END;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OldBody;   -- la respuesta vieja no sobrevive
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
END;
GO

-- Completar -----------------------------------------------------------------------------------

-- Dos instancias terminan la misma solicitud (una tomó la otra por abandonada): gana la primera y todas reproducen lo mismo
CREATE PROCEDURE Test_Idempotency.[test completing twice keeps the first response]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    DECLARE @First BIT, @Second BIT;
    EXEC Test_Idempotency.Begin_;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 201, @ResponseBody = N'{"first":true}', @Stored = @First OUTPUT;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 409, @ResponseBody = N'{"second":true}', @Stored = @Second OUTPUT;

    DECLARE @HttpStatus INT = (SELECT HttpStatus FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    DECLARE @Body NVARCHAR(MAX) = (SELECT ResponseBody FROM dbo.IdempotentRequests WHERE IdempotencyKey = N'key-1');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 201, @Actual = @HttpStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'{"first":true}', @Actual = @Body;
END;
GO

CREATE PROCEDURE Test_Idempotency.[test a server error response is never stored]
AS
BEGIN
    DECLARE @Stored BIT;
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%200 to 499%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 500, @ResponseBody = N'{}', @Stored = @Stored OUTPUT;
END;
GO

CREATE PROCEDURE Test_Idempotency.[test a response body that is not JSON is rejected]
AS
BEGIN
    DECLARE @Stored BIT;
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%valid JSON%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 200, @ResponseBody = N'not json', @Stored = @Stored OUTPUT;
END;
GO

CREATE PROCEDURE Test_Idempotency.[test completing an unknown key answers not found]
AS
BEGIN
    DECLARE @Stored BIT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%key not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'unknown',
         @HttpStatus = 200, @ResponseBody = N'{}', @Stored = @Stored OUTPUT;
END;
GO

CREATE PROCEDURE Test_Idempotency.[test a response without a body such as a no content answer is stored]
AS
BEGIN
    DECLARE @Stored BIT;
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC Test_Idempotency.Begin_;
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'key-1',
         @HttpStatus = 204, @Stored = @Stored OUTPUT;
    DELETE FROM #Result;
    EXEC Test_Idempotency.Begin_ @Now = '2030-01-01T10:01:00';

    DECLARE @Outcome VARCHAR(12) = (SELECT Outcome FROM #Result);
    DECLARE @HttpStatus INT = (SELECT HttpStatus FROM #Result);
    EXEC tSQLt.AssertEqualsString @Expected = 'Replay', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 204, @Actual = @HttpStatus;
END;
GO

-- Validación ----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Idempotency.[test a scope that is neither a user nor a guest is rejected]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Scope%', @ExpectedErrorNumber = 50400;
    EXEC Test_Idempotency.Begin_ @Scope = N'X:7';
END;
GO

CREATE PROCEDURE Test_Idempotency.[test a lowercase scope prefix is rejected because the scope is compared exactly]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Scope%', @ExpectedErrorNumber = 50400;
    EXEC Test_Idempotency.Begin_ @Scope = N'u:7';
END;
GO

CREATE PROCEDURE Test_Idempotency.[test a request hash that is not hexadecimal is rejected]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%hexadecimal%', @ExpectedErrorNumber = 50400;
    EXEC Test_Idempotency.Begin_ @Hash = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
END;
GO

CREATE PROCEDURE Test_Idempotency.[test a method that does not mutate is rejected]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Method%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Idempotency_Begin @Scope = N'U:7', @Method = N'GET', @Route = N'/cart', @IdempotencyKey = N'key-1',
         @RequestHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
END;
GO

-- Purga ---------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Idempotency.[test the purge deletes only expired keys whatever their status]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    DECLARE @Stored BIT, @Purged INT;
    EXEC Test_Idempotency.Begin_ @Key = N'old-completed', @Now = '2030-01-01T10:00:00';
    EXEC dbo.SP_Idempotency_Complete @Scope = N'U:7', @Method = N'POST', @Route = N'/checkout/confirm', @IdempotencyKey = N'old-completed',
         @HttpStatus = 200, @ResponseBody = N'{}', @Stored = @Stored OUTPUT;
    EXEC Test_Idempotency.Begin_ @Key = N'old-in-progress', @Now = '2030-01-01T10:00:00';
    EXEC Test_Idempotency.Begin_ @Key = N'recent', @Now = '2030-01-02T09:00:00';

    EXEC dbo.SP_Idempotency_PurgeExpired @Now = '2030-01-02T10:00:00', @Purged = @Purged OUTPUT;

    DECLARE @Remaining NVARCHAR(64) = (SELECT IdempotencyKey FROM dbo.IdempotentRequests);
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.IdempotentRequests);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Purged;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'recent', @Actual = @Remaining;
END;
GO

CREATE PROCEDURE Test_Idempotency.[test the purge works in batches and stops at the batch limit]
AS
BEGIN
    CREATE TABLE #Result (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    DECLARE @Limited INT, @Rest INT;
    EXEC Test_Idempotency.Begin_ @Key = N'k1', @Now = '2030-01-01T10:00:00';
    EXEC Test_Idempotency.Begin_ @Key = N'k2', @Now = '2030-01-01T10:00:00';
    EXEC Test_Idempotency.Begin_ @Key = N'k3', @Now = '2030-01-01T10:00:00';
    EXEC Test_Idempotency.Begin_ @Key = N'k4', @Now = '2030-01-01T10:00:00';
    EXEC Test_Idempotency.Begin_ @Key = N'k5', @Now = '2030-01-01T10:00:00';

    EXEC dbo.SP_Idempotency_PurgeExpired @Now = '2030-01-03T00:00:00', @BatchSize = 2, @MaxBatches = 2, @Purged = @Limited OUTPUT;
    DECLARE @Left INT = (SELECT COUNT(*) FROM dbo.IdempotentRequests);
    EXEC dbo.SP_Idempotency_PurgeExpired @Now = '2030-01-03T00:00:00', @BatchSize = 2, @MaxBatches = 10, @Purged = @Rest OUTPUT;
    DECLARE @LeftAfter INT = (SELECT COUNT(*) FROM dbo.IdempotentRequests);

    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Limited;   -- dos lotes de dos
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Left;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rest;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @LeftAfter;
END;
GO

CREATE PROCEDURE Test_Idempotency.[test the purge rejects an invalid batch size]
AS
BEGIN
    DECLARE @Purged INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%BatchSize%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Idempotency_PurgeExpired @BatchSize = 0, @Purged = @Purged OUTPUT;
END;
GO
