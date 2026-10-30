/* =====================================================================
   Objeto   : dbo.SP_Tokens_RevokeFamily
   Version  : 1.0.0
   Cambio   : Primera versión: revoca todos los tokens de una familia (cierre de sesión)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Se indica la familia o un token de ella, nunca ambos. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Tokens_RevokeFamily
  @IDFamily      UNIQUEIDENTIFIER = NULL,
  @TokenHash     CHAR(64)         = NULL,
  @Now           DATETIME2(3)     = NULL,
  @RevokedTokens INT              = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF (@IDFamily IS NULL AND @TokenHash IS NULL) OR (@IDFamily IS NOT NULL AND @TokenHash IS NOT NULL)
    THROW 50400, 'Provide either IDFamily or TokenHash.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @RevokedTokens = 0;

  -- El cierre de sesión solo conoce el token que tiene el navegador: la familia se busca a partir de él.
  -- Poseer el token es la prueba de que la sesión es suya, así que no hace falta otra comprobación de pertenencia.
  IF @TokenHash IS NOT NULL
    SET @IDFamily = (SELECT IDFamily FROM dbo.RefreshTokens WHERE TokenHash = @TokenHash);

  -- Repetir el cierre de sesión, o cerrarla con un token desconocido, no es un error: el resultado es el mismo
  IF @IDFamily IS NOT NULL
  BEGIN
    UPDATE dbo.RefreshTokens SET RevokedAt = @Now WHERE IDFamily = @IDFamily AND RevokedAt IS NULL;
    SET @RevokedTokens = @@ROWCOUNT;
  END;
END;
GO
