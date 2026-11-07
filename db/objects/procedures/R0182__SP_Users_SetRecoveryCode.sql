/* =====================================================================
   Objeto   : dbo.SP_Users_SetRecoveryCode
   Version  : 1.0.0
   Cambio   : Primera versión: guarda el hash del código con el que un invitado recupera su pedido
   Autor    : Equipo ShopCart   Fecha: 2026-11-06
   Compat   : Nueva. Errores: 50400 identificador o hash inválidos, 50404 la cuenta no existe,
              50422 la cuenta no es de invitado o todavía no tiene un correo de contacto.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_SetRecoveryCode
  @IDUser   INT,
  @CodeHash CHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL OR @CodeHash IS NULL OR LEN(@CodeHash) <> 64
    THROW 50400, 'IDUser and a 64 character hash are required.', 1;

  DECLARE @IsGuest BIT = (SELECT IsGuest FROM dbo.Users WHERE IDUser = @IDUser);
  IF @IsGuest IS NULL
    THROW 50404, 'Account not found.', 1;
  IF @IsGuest = 0
    THROW 50422, 'Only a guest account has a recovery code.', 1;
  -- Sin correo real no hay con qué recuperar: la recuperación pide el correo y el código juntos
  IF EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDUser AND Email LIKE N'%@guest.invalid')
    THROW 50422, 'The guest account has no contact email yet.', 1;

  -- Cada código nuevo reemplaza al anterior: el que se mostró antes deja de servir
  UPDATE dbo.Users SET GuestRecoveryHash = @CodeHash WHERE IDUser = @IDUser;
END;
GO
