/* =====================================================================
   Objeto   : dbo.SP_Users_Provision
   Version  : 1.0.0
   Cambio   : Primera versión: alta de una cuenta con rol para las cuentas de demostración (administrador, operador, cliente)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Es idempotente: si el correo ya existe devuelve esa cuenta sin cambiar nada. Errores: 50400 datos u
              rol inválidos. El runner le niega EXECUTE al login de la aplicación: solo lo usa el paso de semilla.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Users_Provision
  @Email        NVARCHAR(256),
  @PasswordHash NVARCHAR(255),
  @FullName     NVARCHAR(120),
  @IDRole       TINYINT,
  @IDUser       INT OUTPUT,
  -- 1 si la cuenta se creó ahora, 0 si ya existía
  @Created      BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Email = LTRIM(RTRIM(@Email));
  SET @FullName = LTRIM(RTRIM(@FullName));

  IF ISNULL(@Email, N'') = N'' OR CHARINDEX(N'@', @Email) < 2 OR ISNULL(@PasswordHash, N'') = N'' OR ISNULL(@FullName, N'') = N''
    THROW 50400, 'A valid email, a password hash and the full name are required.', 1;
  IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = @IDRole)
    THROW 50400, 'The role does not exist.', 1;

  -- SP_Users_Register nunca asigna un rol (un error del backend no debe poder crear un administrador desde un formulario
  -- público); esta sí, y por eso la aplicación no puede ejecutarla. Una cuenta que ya existe no se toca, ni su contraseña.
  SET @IDUser = (SELECT IDUser FROM dbo.Users WHERE Email = @Email);
  SET @Created = 0;
  IF @IDUser IS NOT NULL RETURN;

  BEGIN TRY
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (@IDRole, @Email, @PasswordHash, @FullName);
    SET @IDUser = SCOPE_IDENTITY();
    SET @Created = 1;
  END TRY
  BEGIN CATCH
    -- Dos pasos de semilla simultáneos: gana el primero y el segundo devuelve su cuenta
    IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    SET @IDUser = (SELECT IDUser FROM dbo.Users WHERE Email = @Email);
  END CATCH;
END;
GO
