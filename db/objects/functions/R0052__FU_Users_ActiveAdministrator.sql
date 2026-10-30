/* =====================================================================
   Objeto   : dbo.FU_Users_ActiveAdministrator
   Version  : 1.0.0
   Cambio   : Primera versión: devuelve una fila si la cuenta es de un administrador activo
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva; la usan los procedimientos que solo puede ejecutar un administrador
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Users_ActiveAdministrator (@IDUser INT)
RETURNS TABLE
AS
RETURN
  -- El control de roles es del middleware; esta comprobación es la segunda línea de defensa dentro de la base de datos,
  -- para que un error del backend no deje a un cliente cambiar el catálogo. El rol 3 es Administrator (semilla S0001).
  SELECT u.IDUser
  FROM dbo.Users AS u
  WHERE u.IDUser = @IDUser AND u.IDRole = 3 AND u.IsActive = 1;
GO
