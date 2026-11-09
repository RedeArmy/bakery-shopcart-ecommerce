/* =====================================================================
   Objeto   : dbo.FU_Users_ActiveStaff
   Version  : 1.0.0
   Cambio   : Primera versión: devuelve una fila si la cuenta es de un operador o de un administrador activo
   Autor    : Equipo ShopCart   Fecha: 2026-11-09
   Compat   : Nueva; la usan los procedimientos que puede ejecutar el personal (inventario). Los que solo puede ejecutar un
              administrador siguen usando FU_Users_ActiveAdministrator.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Users_ActiveStaff (@IDUser INT)
RETURNS TABLE
AS
RETURN
  -- Segunda línea de defensa tras el middleware de roles. El rol 2 es Operator y el 3 Administrator (semilla S0001): el
  -- administrador puede todo lo que puede el operador
  SELECT u.IDUser
  FROM dbo.Users AS u
  WHERE u.IDUser = @IDUser AND u.IDRole IN (2, 3) AND u.IsActive = 1;
GO
