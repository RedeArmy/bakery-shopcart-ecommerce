/* =====================================================================
   Objeto   : dbo.SP_Users_GetByEmail
   Version  : 1.0.0
   Cambio   : Primera versión: datos de inicio de sesión de una cuenta
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Devuelve cero o una fila; nunca lanza error por un correo desconocido.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_GetByEmail
  @Email NVARCHAR(256),
  @Now   DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  -- Un correo desconocido devuelve un conjunto vacío y no un error: el inicio de sesión responde igual si la cuenta no
  -- existe o si la contraseña es incorrecta, para no revelar qué correos están registrados.
  SELECT u.IDUser, u.IDRole, RoleName = r.Name, u.Email, u.PasswordHash, u.FullName, u.Phone, u.IsActive,
         u.FailedAttempts, u.LockedUntil,
         IsLocked = CAST(CASE WHEN u.LockedUntil > @Now THEN 1 ELSE 0 END AS BIT)
  FROM dbo.Users AS u
  JOIN dbo.Roles AS r ON r.IDRole = u.IDRole
  WHERE u.Email = LTRIM(RTRIM(@Email));
END;
GO
