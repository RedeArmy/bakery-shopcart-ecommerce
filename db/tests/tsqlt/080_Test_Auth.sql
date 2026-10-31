/* =====================================================================
   Objeto   : Test_Auth (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Cuentas, bloqueo progresivo y tokens de refresco con detección de reutilización
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Auth';
GO

-- Un administrador y una cliente. Los roles se insertan solo si faltan, por si la prueba corre sin semillas.
CREATE PROCEDURE Test_Auth.SetUp
AS
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 1) INSERT INTO dbo.Roles (IDRole, Name) VALUES (1, N'Customer');
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 2) INSERT INTO dbo.Roles (IDRole, Name) VALUES (2, N'Operator');
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 3) INSERT INTO dbo.Roles (IDRole, Name) VALUES (3, N'Administrator');

    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (3, N'admin@shopcart.test', N'not-a-real-hash', N'Test Admin'),
           (1, N'customer@shopcart.test', N'not-a-real-hash', N'Test Customer');
END;
GO

-- Registro ----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Auth.[test registering creates a customer with the trimmed email]
AS
BEGIN
    DECLARE @IDUser INT;
    EXEC dbo.SP_Users_Register @Email = N'  new.customer@shopcart.test ', @PasswordHash = N'hash', @FullName = N' New Customer ',
         @Phone = N'55550000', @IDUser = @IDUser OUTPUT;

    DECLARE @Role INT = (SELECT IDRole FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Email NVARCHAR(256) = (SELECT Email FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Users WHERE IDUser = @IDUser);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Role;
    EXEC tSQLt.AssertEqualsString @Expected = N'new.customer@shopcart.test', @Actual = @Email;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Active;
END;
GO

CREATE PROCEDURE Test_Auth.[test an email already registered answers a conflict whatever its case]
AS
BEGIN
    DECLARE @IDUser INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%already registered%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Users_Register @Email = N'CUSTOMER@shopcart.test', @PasswordHash = N'hash', @FullName = N'Someone', @IDUser = @IDUser OUTPUT;
END;
GO

CREATE PROCEDURE Test_Auth.[test an email without an at sign is rejected as an invalid parameter]
AS
BEGIN
    DECLARE @IDUser INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Users_Register @Email = N'not-an-email', @PasswordHash = N'hash', @FullName = N'Someone', @IDUser = @IDUser OUTPUT;
END;
GO

-- Consulta para iniciar sesión --------------------------------------------------------------

CREATE PROCEDURE Test_Auth.[test the login lookup returns the account with its role and no lock]
AS
BEGIN
    CREATE TABLE #Result (IDUser INT, IDRole TINYINT, RoleName NVARCHAR(30), Email NVARCHAR(256), PasswordHash NVARCHAR(255),
                          FullName NVARCHAR(120), Phone NVARCHAR(20), IsActive BIT, FailedAttempts TINYINT, LockedUntil DATETIME2(3), IsLocked BIT);
    INSERT INTO #Result EXEC dbo.SP_Users_GetByEmail @Email = N'ADMIN@shopcart.test';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Role NVARCHAR(30) = (SELECT RoleName FROM #Result);
    DECLARE @Locked INT = (SELECT CAST(IsLocked AS INT) FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'Administrator', @Actual = @Role;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Locked;
END;
GO

CREATE PROCEDURE Test_Auth.[test an unknown email returns no rows and no error]
AS
BEGIN
    CREATE TABLE #Result (IDUser INT, IDRole TINYINT, RoleName NVARCHAR(30), Email NVARCHAR(256), PasswordHash NVARCHAR(255),
                          FullName NVARCHAR(120), Phone NVARCHAR(20), IsActive BIT, FailedAttempts TINYINT, LockedUntil DATETIME2(3), IsLocked BIT);
    INSERT INTO #Result EXEC dbo.SP_Users_GetByEmail @Email = N'nobody@shopcart.test';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Auth.[test the lookup reports a lock that has not expired yet]
AS
BEGIN
    UPDATE dbo.Users SET LockedUntil = '2030-01-01T10:05:00' WHERE Email = N'customer@shopcart.test';
    CREATE TABLE #Result (IDUser INT, IDRole TINYINT, RoleName NVARCHAR(30), Email NVARCHAR(256), PasswordHash NVARCHAR(255),
                          FullName NVARCHAR(120), Phone NVARCHAR(20), IsActive BIT, FailedAttempts TINYINT, LockedUntil DATETIME2(3), IsLocked BIT);

    INSERT INTO #Result EXEC dbo.SP_Users_GetByEmail @Email = N'customer@shopcart.test', @Now = '2030-01-01T10:00:00';
    DECLARE @Before INT = (SELECT CAST(IsLocked AS INT) FROM #Result);
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Users_GetByEmail @Email = N'customer@shopcart.test', @Now = '2030-01-01T10:06:00';
    DECLARE @After INT = (SELECT CAST(IsLocked AS INT) FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Before;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @After;
END;
GO

-- Intentos fallidos y bloqueo progresivo ----------------------------------------------------

CREATE PROCEDURE Test_Auth.[test four failed attempts only count]
AS
BEGIN
    DECLARE @Now DATETIME2(3) = '2030-01-01T10:00:00';
    EXEC dbo.SP_Users_RecordFailedAttempt @Email = N'customer@shopcart.test', @Now = @Now;
    EXEC dbo.SP_Users_RecordFailedAttempt @Email = N'customer@shopcart.test', @Now = @Now;
    EXEC dbo.SP_Users_RecordFailedAttempt @Email = N'customer@shopcart.test', @Now = @Now;
    EXEC dbo.SP_Users_RecordFailedAttempt @Email = N'customer@shopcart.test', @Now = @Now;

    DECLARE @Attempts INT = (SELECT FailedAttempts FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @Locked INT = (SELECT COUNT(*) FROM dbo.Users WHERE Email = N'customer@shopcart.test' AND LockedUntil IS NOT NULL);
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Attempts;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Locked;
END;
GO

CREATE PROCEDURE Test_Auth.[test the fifth failed attempt locks the account for one minute]
AS
BEGIN
    DECLARE @Now DATETIME2(3) = '2030-01-01T10:00:00';
    UPDATE dbo.Users SET FailedAttempts = 4 WHERE Email = N'customer@shopcart.test';
    EXEC dbo.SP_Users_RecordFailedAttempt @Email = N'customer@shopcart.test', @Now = @Now;

    DECLARE @Until VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), LockedUntil, 121) FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-01-01 10:01:00.000', @Actual = @Until;
END;
GO

CREATE PROCEDURE Test_Auth.[test every further failure doubles the lock]
AS
BEGIN
    DECLARE @Now DATETIME2(3) = '2030-01-01T10:00:00';
    UPDATE dbo.Users SET FailedAttempts = 6 WHERE Email = N'customer@shopcart.test';
    EXEC dbo.SP_Users_RecordFailedAttempt @Email = N'customer@shopcart.test', @Now = @Now;   -- 7.º intento: 4 minutos

    DECLARE @Until VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), LockedUntil, 121) FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-01-01 10:04:00.000', @Actual = @Until;
END;
GO

CREATE PROCEDURE Test_Auth.[test the lock never exceeds one hour and the counter never overflows]
AS
BEGIN
    DECLARE @Now DATETIME2(3) = '2030-01-01T10:00:00';
    UPDATE dbo.Users SET FailedAttempts = 255 WHERE Email = N'customer@shopcart.test';
    EXEC dbo.SP_Users_RecordFailedAttempt @Email = N'customer@shopcart.test', @Now = @Now;

    DECLARE @Until VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), LockedUntil, 121) FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @Attempts INT = (SELECT FailedAttempts FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-01-01 11:00:00.000', @Actual = @Until;
    EXEC tSQLt.AssertEquals @Expected = 255, @Actual = @Attempts;
END;
GO

-- Un correo desconocido no revela nada: no cambia ninguna cuenta ni falla
CREATE PROCEDURE Test_Auth.[test a failed attempt for an unknown email changes nothing]
AS
BEGIN
    EXEC dbo.SP_Users_RecordFailedAttempt @Email = N'nobody@shopcart.test';

    DECLARE @Touched INT = (SELECT COUNT(*) FROM dbo.Users WHERE FailedAttempts > 0);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Touched;
END;
GO

CREATE PROCEDURE Test_Auth.[test a successful login clears the attempts]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    UPDATE dbo.Users SET FailedAttempts = 3, LockedUntil = '2030-01-01T09:00:00' WHERE IDUser = @IDUser;

    EXEC dbo.SP_Users_RecordSuccessfulLogin @IDUser = @IDUser, @Now = '2030-01-01T10:00:00';

    DECLARE @Attempts INT = (SELECT FailedAttempts FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Locked INT = (SELECT COUNT(*) FROM dbo.Users WHERE IDUser = @IDUser AND LockedUntil IS NOT NULL);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Attempts;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Locked;
END;
GO

CREATE PROCEDURE Test_Auth.[test a successful login on a locked account is refused]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    UPDATE dbo.Users SET LockedUntil = '2030-01-01T10:30:00' WHERE IDUser = @IDUser;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%locked or disabled%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Users_RecordSuccessfulLogin @IDUser = @IDUser, @Now = '2030-01-01T10:00:00';
END;
GO

CREATE PROCEDURE Test_Auth.[test a successful login on an unknown account answers not found]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%User not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Users_RecordSuccessfulLogin @IDUser = -1;
END;
GO

-- Activar y desactivar ----------------------------------------------------------------------

CREATE PROCEDURE Test_Auth.[test deactivating an account revokes its sessions and leaves an audit entry]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDCustomer, @IDFamily = '11111111-1111-1111-1111-111111111111',
         @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;

    EXEC dbo.SP_Users_SetStatus @IDActor = @IDAdmin, @IDUser = @IDCustomer, @IsActive = 0, @Now = '2030-01-01T10:00:00';

    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Users WHERE IDUser = @IDCustomer);
    DECLARE @StillValid INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDUser = @IDCustomer AND RevokedAt IS NULL);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Users' AND Action = N'StatusChange'
                          AND EntityKey = CAST(@IDCustomer AS NVARCHAR(40)) AND IDUser = @IDAdmin);

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @StillValid;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Auth.[test reactivating an account clears its lock]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    UPDATE dbo.Users SET IsActive = 0, FailedAttempts = 9, LockedUntil = '2030-01-01T11:00:00' WHERE IDUser = @IDCustomer;

    EXEC dbo.SP_Users_SetStatus @IDActor = @IDAdmin, @IDUser = @IDCustomer, @IsActive = 1;

    DECLARE @Attempts INT = (SELECT FailedAttempts FROM dbo.Users WHERE IDUser = @IDCustomer);
    DECLARE @Locked INT = (SELECT COUNT(*) FROM dbo.Users WHERE IDUser = @IDCustomer AND LockedUntil IS NOT NULL);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Attempts;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Locked;
END;
GO

CREATE PROCEDURE Test_Auth.[test repeating the same status writes no new audit entry]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');

    EXEC dbo.SP_Users_SetStatus @IDActor = @IDAdmin, @IDUser = @IDCustomer, @IsActive = 1;

    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Users');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Audit;
END;
GO

CREATE PROCEDURE Test_Auth.[test only an administrator can change the status of an account]
AS
BEGIN
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Users_SetStatus @IDActor = @IDCustomer, @IDUser = @IDCustomer, @IsActive = 1;
END;
GO

CREATE PROCEDURE Test_Auth.[test an administrator cannot deactivate their own account]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%your own account%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Users_SetStatus @IDActor = @IDAdmin, @IDUser = @IDAdmin, @IsActive = 0;
END;
GO

CREATE PROCEDURE Test_Auth.[test changing the status of an unknown account answers not found]
AS
BEGIN
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%User not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Users_SetStatus @IDActor = @IDAdmin, @IDUser = -1, @IsActive = 0;
END;
GO

-- Listado -----------------------------------------------------------------------------------

CREATE PROCEDURE Test_Auth.[test the user list never exposes the password hash]
AS
BEGIN
    DECLARE @Exposed INT = (SELECT COUNT(*) FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(N'dbo.SP_Users_List'), NULL)
                            WHERE name = N'PasswordHash');
    DECLARE @Columns INT = (SELECT COUNT(*) FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(N'dbo.SP_Users_List'), NULL));

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Exposed;
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @Columns;
END;
GO

CREATE PROCEDURE Test_Auth.[test the user list filters by role and by search text and reports the total]
AS
BEGIN
    CREATE TABLE #Result (IDUser INT, Email NVARCHAR(256), FullName NVARCHAR(120), Phone NVARCHAR(20), IDRole TINYINT, RoleName NVARCHAR(30),
                          IsActive BIT, LockedUntil DATETIME2(3), CreatedAt DATETIME2(3), TotalCount INT);

    INSERT INTO #Result EXEC dbo.SP_Users_List @IDRole = 1;
    DECLARE @Customers INT = (SELECT COUNT(*) FROM #Result);
    DELETE FROM #Result;

    INSERT INTO #Result EXEC dbo.SP_Users_List @Search = N'TEST ADMIN';
    DECLARE @Found INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Total INT = (SELECT MAX(TotalCount) FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Customers;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Total;
END;
GO

-- Un % escrito por el usuario es texto, no un comodín
CREATE PROCEDURE Test_Auth.[test a wildcard in the search text matches nothing]
AS
BEGIN
    CREATE TABLE #Result (IDUser INT, Email NVARCHAR(256), FullName NVARCHAR(120), Phone NVARCHAR(20), IDRole TINYINT, RoleName NVARCHAR(30),
                          IsActive BIT, LockedUntil DATETIME2(3), CreatedAt DATETIME2(3), TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Users_List @Search = N'%';

    DECLARE @Found INT = (SELECT COUNT(*) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Found;
END;
GO

CREATE PROCEDURE Test_Auth.[test the user list pages its rows]
AS
BEGIN
    CREATE TABLE #Result (IDUser INT, Email NVARCHAR(256), FullName NVARCHAR(120), Phone NVARCHAR(20), IDRole TINYINT, RoleName NVARCHAR(30),
                          IsActive BIT, LockedUntil DATETIME2(3), CreatedAt DATETIME2(3), TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Users_List @PageNumber = 2, @PageSize = 1;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Total INT = (SELECT MAX(TotalCount) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Auth.[test an invalid page size is rejected]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%PageSize%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Users_List @PageSize = 101;
END;
GO

-- Tokens de refresco ------------------------------------------------------------------------

CREATE PROCEDURE Test_Auth.[test saving a token stores only the hash]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '22222222-2222-2222-2222-222222222222',
         @TokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;

    DECLARE @Stored INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDRefreshToken = @IDToken AND RevokedAt IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Stored;
END;
GO

CREATE PROCEDURE Test_Auth.[test a token that is not a sha-256 hash is rejected]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%hexadecimal%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '22222222-2222-2222-2222-222222222222',
         @TokenHash = 'this-is-a-raw-token-and-not-a-hash-this-is-a-raw-token-and-not-a-ha', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;
END;
GO

CREATE PROCEDURE Test_Auth.[test a token that has already expired is rejected]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%future%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '22222222-2222-2222-2222-222222222222',
         @TokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @ExpiresAt = '2029-12-31T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;
END;
GO

CREATE PROCEDURE Test_Auth.[test a token for a disabled account is refused]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT;
    UPDATE dbo.Users SET IsActive = 0 WHERE IDUser = @IDUser;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%disabled%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '22222222-2222-2222-2222-222222222222',
         @TokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;
END;
GO

CREATE PROCEDURE Test_Auth.[test a family cannot be shared between two accounts]
AS
BEGIN
    DECLARE @IDCustomer INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDAdmin INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    DECLARE @IDToken BIGINT;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDCustomer, @IDFamily = '33333333-3333-3333-3333-333333333333',
         @TokenHash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%another account%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDAdmin, @IDFamily = '33333333-3333-3333-3333-333333333333',
         @TokenHash = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;
END;
GO

CREATE PROCEDURE Test_Auth.[test rotating a token revokes it and issues the next one in the same family]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT, @Outcome VARCHAR(20), @IDFamily UNIQUEIDENTIFIER, @IDNew BIGINT, @IDUserOut INT;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '44444444-4444-4444-4444-444444444444',
         @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;

    EXEC dbo.SP_Tokens_Rotate @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @NewTokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @NewExpiresAt = '2030-01-09T10:00:00',
         @Now = '2030-01-02T10:00:00', @Outcome = @Outcome OUTPUT, @IDUser = @IDUserOut OUTPUT, @IDFamily = @IDFamily OUTPUT,
         @IDRefreshToken = @IDNew OUTPUT;

    DECLARE @OldRevoked INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDRefreshToken = @IDToken AND RevokedAt IS NOT NULL AND IDReplacedBy = @IDNew);
    DECLARE @NewSameFamily INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDRefreshToken = @IDNew AND IDFamily = '44444444-4444-4444-4444-444444444444' AND RevokedAt IS NULL);

    EXEC tSQLt.AssertEqualsString @Expected = N'Rotated', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = @IDUser, @Actual = @IDUserOut;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OldRevoked;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @NewSameFamily;
END;
GO

-- Reutilizar un token ya rotado indica robo: la familia entera queda revocada y la revocación PERSISTE (no es un THROW)
CREATE PROCEDURE Test_Auth.[test presenting a rotated token again revokes the whole family]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT, @Outcome VARCHAR(20), @IDNew BIGINT;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '55555555-5555-5555-5555-555555555555',
         @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;
    EXEC dbo.SP_Tokens_Rotate @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @NewTokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @NewExpiresAt = '2030-01-09T10:00:00',
         @Now = '2030-01-02T10:00:00', @Outcome = @Outcome OUTPUT, @IDRefreshToken = @IDNew OUTPUT;

    EXEC dbo.SP_Tokens_Rotate @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @NewTokenHash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', @NewExpiresAt = '2030-01-09T11:00:00',
         @Now = '2030-01-02T11:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @StillValid INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDFamily = '55555555-5555-5555-5555-555555555555' AND RevokedAt IS NULL);
    EXEC tSQLt.AssertEqualsString @Expected = N'ReuseDetected', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @StillValid;
END;
GO

CREATE PROCEDURE Test_Auth.[test an unknown token is reported as not found]
AS
BEGIN
    DECLARE @Outcome VARCHAR(20);
    EXEC dbo.SP_Tokens_Rotate @TokenHash = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
         @NewTokenHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', @NewExpiresAt = '2030-01-09T10:00:00',
         @Now = '2030-01-02T10:00:00', @Outcome = @Outcome OUTPUT;

    EXEC tSQLt.AssertEqualsString @Expected = N'NotFound', @Actual = @Outcome;
END;
GO

CREATE PROCEDURE Test_Auth.[test an expired token is reported as expired and not rotated]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT, @Outcome VARCHAR(20);
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '66666666-6666-6666-6666-666666666666',
         @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;

    EXEC dbo.SP_Tokens_Rotate @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @NewTokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @NewExpiresAt = '2030-01-20T10:00:00',
         @Now = '2030-01-09T10:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @Tokens INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDFamily = '66666666-6666-6666-6666-666666666666');
    EXEC tSQLt.AssertEqualsString @Expected = N'Expired', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Tokens;
END;
GO

CREATE PROCEDURE Test_Auth.[test a token of a disabled account revokes its family]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT, @Outcome VARCHAR(20);
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '77777777-7777-7777-7777-777777777777',
         @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;
    UPDATE dbo.Users SET IsActive = 0 WHERE IDUser = @IDUser;

    EXEC dbo.SP_Tokens_Rotate @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @NewTokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @NewExpiresAt = '2030-01-09T10:00:00',
         @Now = '2030-01-02T10:00:00', @Outcome = @Outcome OUTPUT;

    DECLARE @StillValid INT = (SELECT COUNT(*) FROM dbo.RefreshTokens WHERE IDFamily = '77777777-7777-7777-7777-777777777777' AND RevokedAt IS NULL);
    EXEC tSQLt.AssertEqualsString @Expected = N'UserInactive', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @StillValid;
END;
GO

CREATE PROCEDURE Test_Auth.[test rotating a token with the same hash for old and new is rejected]
AS
BEGIN
    DECLARE @Outcome VARCHAR(20);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%different%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Tokens_Rotate @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         @NewTokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @NewExpiresAt = '2030-01-09T10:00:00',
         @Now = '2030-01-02T10:00:00', @Outcome = @Outcome OUTPUT;
END;
GO

CREATE PROCEDURE Test_Auth.[test logging out with a token revokes its family and repeating it is harmless]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT, @First INT, @Second INT, @Unknown INT;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '88888888-8888-8888-8888-888888888888',
         @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;

    EXEC dbo.SP_Tokens_RevokeFamily @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Now = '2030-01-02T10:00:00',
         @RevokedTokens = @First OUTPUT;
    EXEC dbo.SP_Tokens_RevokeFamily @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @Now = '2030-01-02T10:00:00',
         @RevokedTokens = @Second OUTPUT;
    EXEC dbo.SP_Tokens_RevokeFamily @TokenHash = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', @RevokedTokens = @Unknown OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Unknown;
END;
GO

CREATE PROCEDURE Test_Auth.[test revoking by family id revokes every live token of the family]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'customer@shopcart.test');
    DECLARE @IDToken BIGINT, @Revoked INT;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '99999999-9999-9999-9999-999999999999',
         @TokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;
    EXEC dbo.SP_Tokens_Save @IDUser = @IDUser, @IDFamily = '99999999-9999-9999-9999-999999999999',
         @TokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', @ExpiresAt = '2030-01-08T10:00:00',
         @Now = '2030-01-01T10:00:00', @IDRefreshToken = @IDToken OUTPUT;

    EXEC dbo.SP_Tokens_RevokeFamily @IDFamily = '99999999-9999-9999-9999-999999999999', @RevokedTokens = @Revoked OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Revoked;
END;
GO

CREATE PROCEDURE Test_Auth.[test revoking needs the family or a token but not both]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%either IDFamily or TokenHash%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Tokens_RevokeFamily;
END;
GO

-- Perfil por identificador ------------------------------------------------------------------

CREATE PROCEDURE Test_Auth.[test the profile lookup returns the role and never the password hash]
AS
BEGIN
    DECLARE @IDUser INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'admin@shopcart.test');
    CREATE TABLE #Result (IDUser INT, IDRole TINYINT, RoleName NVARCHAR(30), Email NVARCHAR(256), FullName NVARCHAR(120), Phone NVARCHAR(20), IsActive BIT);
    INSERT INTO #Result EXEC dbo.SP_Users_GetById @IDUser = @IDUser;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Role NVARCHAR(30) = (SELECT RoleName FROM #Result);
    DECLARE @Columns INT = (SELECT COUNT(*) FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(N'dbo.SP_Users_GetById'), 0) WHERE name = N'PasswordHash');

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'Administrator', @Actual = @Role;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Columns;
END;
GO

CREATE PROCEDURE Test_Auth.[test the profile lookup of an unknown account returns no rows and no error]
AS
BEGIN
    CREATE TABLE #Result (IDUser INT, IDRole TINYINT, RoleName NVARCHAR(30), Email NVARCHAR(256), FullName NVARCHAR(120), Phone NVARCHAR(20), IsActive BIT);
    INSERT INTO #Result EXEC dbo.SP_Users_GetById @IDUser = -1;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

-- Alta con rol (cuentas de demostración) ---------------------------------------------------------

CREATE PROCEDURE Test_Auth.[test provisioning creates an account with the given role]
AS
BEGIN
    DECLARE @IDUser INT, @Created BIT;
    EXEC dbo.SP_Users_Provision @Email = N'  operator@shopcart.demo ', @PasswordHash = N'hash', @FullName = N' Operator ', @IDRole = 2,
         @IDUser = @IDUser OUTPUT, @Created = @Created OUTPUT;

    DECLARE @Role INT = (SELECT IDRole FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Email NVARCHAR(256) = (SELECT Email FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Name NVARCHAR(120) = (SELECT FullName FROM dbo.Users WHERE IDUser = @IDUser);
    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Users WHERE IDUser = @IDUser);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Role;
    EXEC tSQLt.AssertEqualsString @Expected = N'operator@shopcart.demo', @Actual = @Email;
    EXEC tSQLt.AssertEqualsString @Expected = N'Operator', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Created;
END;
GO

-- Repetir el paso de semilla no cambia nada: ni la contraseña, ni el nombre, ni el rol de una cuenta que ya existe
CREATE PROCEDURE Test_Auth.[test provisioning an existing email changes nothing]
AS
BEGIN
    DECLARE @First INT, @Second INT, @FirstCreated BIT, @SecondCreated BIT;
    EXEC dbo.SP_Users_Provision @Email = N'seed@shopcart.demo', @PasswordHash = N'original', @FullName = N'Original', @IDRole = 3,
         @IDUser = @First OUTPUT, @Created = @FirstCreated OUTPUT;
    EXEC dbo.SP_Users_Provision @Email = N'SEED@shopcart.demo', @PasswordHash = N'other', @FullName = N'Other', @IDRole = 1,
         @IDUser = @Second OUTPUT, @Created = @SecondCreated OUTPUT;

    DECLARE @Hash NVARCHAR(255) = (SELECT PasswordHash FROM dbo.Users WHERE IDUser = @First);
    DECLARE @Name NVARCHAR(120) = (SELECT FullName FROM dbo.Users WHERE IDUser = @First);
    DECLARE @Role INT = (SELECT IDRole FROM dbo.Users WHERE IDUser = @First);
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.Users WHERE Email = N'seed@shopcart.demo');
    EXEC tSQLt.AssertEquals @Expected = @First, @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @FirstCreated;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @SecondCreated;
    EXEC tSQLt.AssertEqualsString @Expected = N'original', @Actual = @Hash;
    EXEC tSQLt.AssertEqualsString @Expected = N'Original', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Role;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Auth.[test provisioning rejects a role that does not exist]
AS
BEGIN
    DECLARE @IDUser INT, @Created BIT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%role does not exist%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Users_Provision @Email = N'x@shopcart.demo', @PasswordHash = N'hash', @FullName = N'X', @IDRole = 9,
         @IDUser = @IDUser OUTPUT, @Created = @Created OUTPUT;
END;
GO

CREATE PROCEDURE Test_Auth.[test provisioning rejects missing data]
AS
BEGIN
    DECLARE @IDUser INT, @Created BIT, @NoHash INT = 0, @NoName INT = 0, @BadEmail INT = 0;
    BEGIN TRY EXEC dbo.SP_Users_Provision @Email = N'a@shopcart.demo', @PasswordHash = N'', @FullName = N'A', @IDRole = 1, @IDUser = @IDUser OUTPUT, @Created = @Created OUTPUT; END TRY
    BEGIN CATCH SET @NoHash = ERROR_NUMBER(); END CATCH;
    BEGIN TRY EXEC dbo.SP_Users_Provision @Email = N'a@shopcart.demo', @PasswordHash = N'hash', @FullName = N' ', @IDRole = 1, @IDUser = @IDUser OUTPUT, @Created = @Created OUTPUT; END TRY
    BEGIN CATCH SET @NoName = ERROR_NUMBER(); END CATCH;
    BEGIN TRY EXEC dbo.SP_Users_Provision @Email = N'not-an-email', @PasswordHash = N'hash', @FullName = N'A', @IDRole = 1, @IDUser = @IDUser OUTPUT, @Created = @Created OUTPUT; END TRY
    BEGIN CATCH SET @BadEmail = ERROR_NUMBER(); END CATCH;
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.Users WHERE Email LIKE N'%@shopcart.demo');

    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @NoHash;
    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @NoName;
    EXEC tSQLt.AssertEquals @Expected = 50400, @Actual = @BadEmail;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO
