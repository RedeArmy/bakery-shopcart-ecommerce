/* =====================================================================
   Objeto   : dbo.SP_Users_CreateGuest
   Version  : 1.0.0
   Cambio   : Primera versión: crea la cuenta de invitado de quien compra o usa un cupón sin registrarse
   Autor    : Equipo ShopCart   Fecha: 2026-11-06
   Compat   : Nueva. Sin errores esperables. Devuelve el identificador de la cuenta creada.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_CreateGuest
  @IDUser INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  -- El correo es obligatorio en la tabla y único entre cuentas reales: el invitado recibe uno inventado y de un dominio
  -- reservado (.invalid, RFC 2606) que nadie puede registrar; el verdadero se guarda al pedir sus datos de contacto.
  -- La contraseña es un valor que ningún hash produce: con IsGuest = 1 la cuenta tampoco aparece en el inicio de sesión.
  DECLARE @Placeholder NVARCHAR(256) = CONCAT(N'guest-', LOWER(REPLACE(CONVERT(CHAR(36), NEWID()), N'-', N'')), N'@guest.invalid');

  -- El nombre provisional es un dato en español: lo ve el personal en un pedido hasta que el invitado da su nombre
  INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName, IsGuest)
  -- cspell:disable-next-line
  VALUES (1, @Placeholder, N'!', N'Invitado', 1);
  SET @IDUser = SCOPE_IDENTITY();
END;
GO
