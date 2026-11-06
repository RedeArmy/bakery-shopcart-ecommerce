/* =====================================================================
   Objeto   : dbo.SP_Users_SetGuestContact
   Version  : 1.0.0
   Cambio   : Primera versión: guarda el nombre, el correo y el teléfono de contacto de una cuenta de invitado
   Autor    : Equipo ShopCart   Fecha: 2026-11-06
   Compat   : Nueva. Errores: 50400 datos obligatorios, 50404 la cuenta no existe, 50422 la cuenta no es de invitado,
              50409 EMAIL_BELONGS_TO_ACCOUNT (el correo es de una cuenta registrada: debe iniciar sesión).
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_SetGuestContact
  @IDUser   INT,
  @Email    NVARCHAR(256),
  @FullName NVARCHAR(120),
  @Phone    NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Email = LTRIM(RTRIM(@Email));
  SET @FullName = LTRIM(RTRIM(@FullName));
  SET @Phone = NULLIF(LTRIM(RTRIM(@Phone)), N'');

  IF @IDUser IS NULL OR ISNULL(@Email, N'') = N'' OR CHARINDEX(N'@', @Email) < 2 OR ISNULL(@FullName, N'') = N''
    THROW 50400, 'IDUser, a valid email and the full name are required.', 1;
  -- Un correo inventado como el de la cuenta recién creada no es un dato de contacto
  IF @Email LIKE N'%@guest.invalid'
    THROW 50400, 'A real contact email is required.', 1;

  DECLARE @IsGuest BIT = (SELECT IsGuest FROM dbo.Users WHERE IDUser = @IDUser);
  IF @IsGuest IS NULL
    THROW 50404, 'Account not found.', 1;
  IF @IsGuest = 0
    THROW 50422, 'Only a guest account has contact data of its own.', 1;

  -- Si el correo es de una cuenta registrada, aceptarlo dejaría a cualquiera hacerse pasar por su dueño: debe iniciar sesión
  IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @Email AND IsGuest = 0)
    THROW 50409, 'EMAIL_BELONGS_TO_ACCOUNT: The email belongs to a registered account; sign in instead.', 1;

  UPDATE dbo.Users SET Email = @Email, FullName = @FullName, Phone = @Phone WHERE IDUser = @IDUser;
END;
GO
