/* =====================================================================
   Objeto   : dbo.SP_Tokens_Save
   Version  : 1.0.0
   Cambio   : Primera versión: guarda el hash de un token de refresco nuevo (inicio de sesión)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 cuenta inexistente, 50409 hash o familia repetidos, 50422 cuenta desactivada.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Tokens_Save
  @IDUser         INT,
  @IDFamily       UNIQUEIDENTIFIER,
  @TokenHash      CHAR(64),
  @ExpiresAt      DATETIME2(3),
  @Now            DATETIME2(3) = NULL,
  @IDRefreshToken BIGINT       OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  -- Solo se guarda el hash SHA-256 en hexadecimal: un volcado de la base de datos no entrega tokens utilizables
  IF @IDUser IS NULL OR @IDFamily IS NULL OR @ExpiresAt IS NULL OR @TokenHash IS NULL OR @TokenHash LIKE N'%[^0-9a-fA-F]%'
    THROW 50400, 'IDUser, IDFamily, ExpiresAt and a 64-character hexadecimal TokenHash are required.', 1;
  IF @ExpiresAt <= @Now
    THROW 50400, 'ExpiresAt must be in the future.', 1;

  DECLARE @IsActive BIT = (SELECT IsActive FROM dbo.Users WHERE IDUser = @IDUser);
  IF @IsActive IS NULL
    THROW 50404, 'User not found.', 1;
  IF @IsActive = 0
    THROW 50422, 'The account is disabled.', 1;

  -- Una familia pertenece a una sola cuenta: si no, revocar una familia podría cerrar sesiones ajenas
  IF EXISTS (SELECT 1 FROM dbo.RefreshTokens WHERE IDFamily = @IDFamily AND IDUser <> @IDUser)
    THROW 50409, 'The token family belongs to another account.', 1;

  BEGIN TRY
    INSERT INTO dbo.RefreshTokens (IDUser, IDFamily, TokenHash, ExpiresAt) VALUES (@IDUser, @IDFamily, @TokenHash, @ExpiresAt);
    SET @IDRefreshToken = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'The token hash already exists.', 1;
    THROW;
  END CATCH;
END;
GO
