/* =====================================================================
   Objeto   : dbo.SP_Users_Register
   Version  : 1.1.0
   Cambio   : Un correo usado solo por cuentas de invitado no impide el registro
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400 datos obligatorios, 50409 correo ya registrado.
   Cambio 1.1.0: solo las cuentas reales (IsGuest = 0) cuentan como correo ya registrado.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_Register
  @Email        NVARCHAR(256),
  @PasswordHash NVARCHAR(255),
  @FullName     NVARCHAR(120),
  @Phone        NVARCHAR(20) = NULL,
  @IDUser       INT          OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Email = LTRIM(RTRIM(@Email));
  SET @FullName = LTRIM(RTRIM(@FullName));
  SET @Phone = NULLIF(LTRIM(RTRIM(@Phone)), N'');

  IF ISNULL(@Email, N'') = N'' OR CHARINDEX(N'@', @Email) < 2 OR ISNULL(@PasswordHash, N'') = N'' OR ISNULL(@FullName, N'') = N''
    THROW 50400, 'A valid email, a password hash and the full name are required.', 1;

  -- El registro público solo crea clientes (rol 1). Los roles de operador y administrador no se piden por parámetro:
  -- un error del backend no debe poder escalar privilegios desde un formulario público.
  IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @Email AND IsGuest = 0)
    THROW 50409, 'The email is already registered.', 1;

  -- Un invitado con este correo no cuenta: puede registrarse quien antes compró sin cuenta (V0013).
  -- Dos registros simultáneos con el mismo correo pasan la comprobación anterior; el índice único decide cuál gana
  BEGIN TRY
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName, Phone)
    VALUES (1, @Email, @PasswordHash, @FullName, @Phone);
    SET @IDUser = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'The email is already registered.', 1;
    THROW;
  END CATCH;
END;
GO
