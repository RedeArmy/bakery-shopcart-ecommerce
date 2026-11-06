/* =====================================================================
   Objeto   : dbo.SP_Users_FindGuestsByEmail
   Version  : 1.0.0
   Cambio   : Primera versión: cuentas de invitado de un correo, con el hash de su código de recuperación
   Autor    : Equipo ShopCart   Fecha: 2026-11-06
   Compat   : Nueva. Devuelve cero o más filas (las cinco más recientes) y nunca lanza por un correo desconocido: la
              recuperación responde igual si el correo no existe o si el código no coincide.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_FindGuestsByEmail
  @Email NVARCHAR(256)
AS
BEGIN
  SET NOCOUNT ON;

  -- Un mismo correo puede tener varias cuentas de invitado (una por compra sin registro); el backend compara el código con cada hash
  SELECT TOP (5) u.IDUser, u.GuestRecoveryHash
  FROM dbo.Users AS u
  WHERE u.Email = LTRIM(RTRIM(@Email)) AND u.IsGuest = 1 AND u.IsActive = 1 AND u.GuestRecoveryHash IS NOT NULL
  ORDER BY u.IDUser DESC;
END;
GO
