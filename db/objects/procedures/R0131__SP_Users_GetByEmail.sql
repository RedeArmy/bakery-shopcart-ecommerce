/* =====================================================================
   Objeto   : dbo.SP_Users_GetByEmail
   Version  : 1.1.0
   Cambio   : Excluye las cuentas de invitado del inicio de sesión
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Devuelve cero o una fila; nunca lanza error por un correo desconocido.
   Cambio 1.1.0: las mismas columnas y el mismo uso; un correo que solo tiene cuentas de invitado devuelve cero filas.
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
  -- Una cuenta de invitado nunca inicia sesión por correo: no tiene contraseña
  WHERE u.Email = LTRIM(RTRIM(@Email)) AND u.IsGuest = 0;
END;
GO
