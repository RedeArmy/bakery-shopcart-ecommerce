/* =====================================================================
   Objeto   : dbo.SP_Users_RecordSuccessfulLogin
   Version  : 1.0.0
   Cambio   : Primera versión: reinicia el contador de intentos fallidos tras un inicio de sesión correcto
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva (no figuraba en el borrador del catálogo). Errores: 50400, 50404 cuenta inexistente,
              50422 cuenta bloqueada o desactivada.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_RecordSuccessfulLogin
  @IDUser INT,
  @Now    DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL
    THROW 50400, 'IDUser is required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  -- Sin este procedimiento el contador de intentos nunca bajaría y un cliente legítimo acabaría bloqueado por fallos
  -- acumulados durante semanas. Aunque el backend ya comprobó el bloqueo, aquí se vuelve a comprobar: es defensa en profundidad
  -- ante una condición de carrera entre un intento fallido y uno correcto.
  DECLARE @IsActive BIT, @LockedUntil DATETIME2(3);
  SELECT @IsActive = IsActive, @LockedUntil = LockedUntil FROM dbo.Users WITH (UPDLOCK, ROWLOCK) WHERE IDUser = @IDUser;

  IF @IsActive IS NULL
    THROW 50404, 'User not found.', 1;
  IF @IsActive = 0 OR @LockedUntil > @Now
    THROW 50422, 'The account is locked or disabled.', 1;

  UPDATE dbo.Users SET FailedAttempts = 0, LockedUntil = NULL WHERE IDUser = @IDUser;
END;
GO
