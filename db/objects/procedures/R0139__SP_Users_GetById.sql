/* =====================================================================
   Objeto   : dbo.SP_Users_GetById
   Version  : 1.0.0
   Cambio   : Primera versión: perfil de una cuenta por su identificador (renovación de sesión y perfil propio)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Devuelve cero o una fila y nunca el hash de la contraseña. Un identificador desconocido no es un error.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_GetById
  @IDUser INT
AS
BEGIN
  SET NOCOUNT ON;

  -- El hash queda fuera a propósito: quien solo necesita el perfil no debe poder leerlo
  SELECT u.IDUser, u.IDRole, RoleName = r.Name, u.Email, u.FullName, u.Phone, u.IsActive
  FROM dbo.Users AS u
  JOIN dbo.Roles AS r ON r.IDRole = u.IDRole
  WHERE u.IDUser = @IDUser;
END;
GO
