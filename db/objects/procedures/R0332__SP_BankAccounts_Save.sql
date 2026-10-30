/* =====================================================================
   Objeto   : dbo.SP_BankAccounts_Save
   Version  : 1.0.0
   Cambio   : Primera versión: el administrador crea o edita una cuenta bancaria
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Sin @IDBankAccount crea; con él edita. Una cuenta con pagos nunca se borra, solo se desactiva.
              Errores: 50400, 50404 cuenta inexistente, 50409 banco y número ya registrados, 50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_BankAccounts_Save
  @IDActor       INT,
  @IDBankAccount INT           = NULL,
  @BankName      NVARCHAR(80),
  @AccountType   NVARCHAR(12),
  @AccountNumber NVARCHAR(30),
  @HolderName    NVARCHAR(120),
  @Instructions  NVARCHAR(300) = NULL,
  @IsActive      BIT           = 1,
  @IDSaved       INT           = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SELECT @BankName = LTRIM(RTRIM(@BankName)), @AccountNumber = LTRIM(RTRIM(@AccountNumber)), @HolderName = LTRIM(RTRIM(@HolderName));
  IF @IDActor IS NULL OR ISNULL(@BankName, N'') = N'' OR ISNULL(@AccountNumber, N'') = N'' OR ISNULL(@HolderName, N'') = N''
     OR @AccountType NOT IN (N'Checking', N'Savings')
    THROW 50400, 'IDActor, BankName, AccountNumber, HolderName and an AccountType of Checking or Savings are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- Dónde se deposita el dinero lo decide solo el administrador
  IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDActor AND IDRole = 3 AND IsActive = 1)
    THROW 50422, 'Only an active administrator can save a bank account.', 1;

  DECLARE @Action NVARCHAR(20) = CASE WHEN @IDBankAccount IS NULL THEN N'Create' ELSE N'Update' END;
  BEGIN TRY
    IF @IDBankAccount IS NULL
    BEGIN
      INSERT INTO dbo.BankAccounts (BankName, AccountType, AccountNumber, HolderName, Instructions, IsActive)
      VALUES (@BankName, @AccountType, @AccountNumber, @HolderName, @Instructions, ISNULL(@IsActive, 1));
      SET @IDSaved = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
      UPDATE dbo.BankAccounts
      SET BankName = @BankName, AccountType = @AccountType, AccountNumber = @AccountNumber, HolderName = @HolderName,
          Instructions = @Instructions, IsActive = ISNULL(@IsActive, 1)
      WHERE IDBankAccount = @IDBankAccount;
      IF @@ROWCOUNT = 0 THROW 50404, 'Bank account not found.', 1;
      SET @IDSaved = @IDBankAccount;
    END;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'The bank account is already registered.', 1;
    THROW;
  END CATCH;

  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDSaved AS NVARCHAR(40));
  DECLARE @New NVARCHAR(MAX) = (SELECT @BankName AS BankName, @AccountType AS AccountType, @IsActive AS IsActive FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
  EXEC dbo.SP_Audit_Record @Module = N'Payments', @EntityName = N'BankAccount', @EntityKey = @EntityKey, @Action = @Action,
       @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
