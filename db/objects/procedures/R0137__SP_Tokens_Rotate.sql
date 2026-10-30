/* =====================================================================
   Objeto   : dbo.SP_Tokens_Rotate
   Version  : 1.0.0
   Cambio   : Primera versión: rotación atómica del token de refresco con detección de reutilización
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400 parámetros inválidos. Los resultados de seguridad esperados NO son errores: se
              informan en @Outcome (Rotated, NotFound, Expired, UserInactive, ReuseDetected).
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Tokens_Rotate
  @TokenHash      CHAR(64),
  @NewTokenHash   CHAR(64),
  @NewExpiresAt   DATETIME2(3),
  @Now            DATETIME2(3)     = NULL,
  @Outcome        VARCHAR(20)      OUTPUT,
  @IDUser         INT              = NULL OUTPUT,
  @IDFamily       UNIQUEIDENTIFIER = NULL OUTPUT,
  @IDRefreshToken BIGINT           = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  IF @TokenHash IS NULL OR @NewTokenHash IS NULL OR @NewExpiresAt IS NULL
     OR @TokenHash LIKE N'%[^0-9a-fA-F]%' OR @NewTokenHash LIKE N'%[^0-9a-fA-F]%' OR @TokenHash = @NewTokenHash
    THROW 50400, 'Two different 64-character hexadecimal hashes and NewExpiresAt are required.', 1;
  IF @NewExpiresAt <= @Now
    THROW 50400, 'NewExpiresAt must be in the future.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- El bloqueo sobre el token viejo serializa dos refrescos simultáneos con el mismo token: el segundo espera, ve el
  -- token ya revocado y se trata como reutilización
  DECLARE @IDOld BIGINT, @RevokedAt DATETIME2(3), @ExpiresAt DATETIME2(3);
  SELECT @IDOld = IDRefreshToken, @IDUser = IDUser, @IDFamily = IDFamily, @RevokedAt = RevokedAt, @ExpiresAt = ExpiresAt
  FROM dbo.RefreshTokens WITH (UPDLOCK, ROWLOCK)
  WHERE TokenHash = @TokenHash;

  -- Los resultados de seguridad se devuelven en @Outcome y no con THROW: con XACT_ABORT, un THROW deshace la transacción
  -- y la revocación de la familia, que es justo lo que hay que conservar, se perdería.
  IF @IDOld IS NULL
    SET @Outcome = 'NotFound';
  ELSE IF @RevokedAt IS NOT NULL
  BEGIN
    -- Un token ya rotado o revocado que vuelve a presentarse indica que fue robado: se invalida toda la familia
    UPDATE dbo.RefreshTokens SET RevokedAt = @Now WHERE IDFamily = @IDFamily AND RevokedAt IS NULL;
    SET @Outcome = 'ReuseDetected';
  END
  ELSE IF @ExpiresAt <= @Now
    SET @Outcome = 'Expired';
  ELSE IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDUser AND IsActive = 1)
  BEGIN
    UPDATE dbo.RefreshTokens SET RevokedAt = @Now WHERE IDFamily = @IDFamily AND RevokedAt IS NULL;
    SET @Outcome = 'UserInactive';
  END
  ELSE
  BEGIN
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES (@IDUser, @IDFamily, @NewTokenHash, @NewExpiresAt);
    SET @IDRefreshToken = SCOPE_IDENTITY();
    UPDATE dbo.RefreshTokens SET RevokedAt = @Now, IDReplacedBy = @IDRefreshToken WHERE IDRefreshToken = @IDOld;
    SET @Outcome = 'Rotated';
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
