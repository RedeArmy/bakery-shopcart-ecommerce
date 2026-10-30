/* =====================================================================
   Objeto   : dbo.SP_Users_RecordFailedAttempt
   Version  : 1.0.0
   Cambio   : Primera versión: cuenta un intento fallido y aplica el bloqueo progresivo de la cuenta
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Devuelve cero o una fila (FailedAttempts, LockedUntil); un correo desconocido no hace nada.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_RecordFailedAttempt
  @Email NVARCHAR(256),
  @Now   DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  -- Bloqueo progresivo (ver docs/architecture/05-security.md): desde el 5.º intento seguido la cuenta queda bloqueada
  -- 1 minuto y la duración se duplica con cada intento más (2, 4, 8, 16, 32) hasta un tope de 60 minutos.
  -- Un único UPDATE incrementa y decide el bloqueo: dos intentos simultáneos nunca cuentan como uno, y como el estado
  -- vive en la base de datos funciona igual con varias réplicas del backend.
  UPDATE u
  SET FailedAttempts = a.Attempts,
      LockedUntil = CASE WHEN a.Attempts >= 5 THEN DATEADD(MINUTE, m.LockMinutes, @Now) ELSE u.LockedUntil END
  OUTPUT inserted.FailedAttempts, inserted.LockedUntil
  FROM dbo.Users AS u
  CROSS APPLY (SELECT Attempts = CASE WHEN u.FailedAttempts < 255 THEN u.FailedAttempts + 1 ELSE 255 END) AS a
  CROSS APPLY (SELECT LockMinutes = CASE WHEN a.Attempts < 5 THEN 0
                                         WHEN a.Attempts - 5 >= 6 THEN 60
                                         ELSE POWER(2, a.Attempts - 5) END) AS m
  WHERE u.Email = LTRIM(RTRIM(@Email));
END;
GO
