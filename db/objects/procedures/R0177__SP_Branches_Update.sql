/* =====================================================================
   Objeto   : dbo.SP_Branches_Update
   Version  : 1.0.0
   Cambio   : Primera versión: edita los datos de una sucursal activa
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. Los pedidos ya hechos conservan la copia que guardaron. Errores: 50400, 50404, 50409 nombre repetido,
              50422 actor sin permiso o sucursal desactivada.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Branches_Update
  @IDActor      INT,
  @IDBranch     INT,
  @Name         NVARCHAR(80),
  @Line1        NVARCHAR(200),
  @Municipality NVARCHAR(80),
  @Department   NVARCHAR(80),
  @Phone        NVARCHAR(20)  = NULL,
  @OpeningHours NVARCHAR(200) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Name = LTRIM(RTRIM(@Name));
  SET @Line1 = LTRIM(RTRIM(@Line1));
  SET @Municipality = LTRIM(RTRIM(@Municipality));
  SET @Department = LTRIM(RTRIM(@Department));
  SET @Phone = NULLIF(LTRIM(RTRIM(@Phone)), N'');
  SET @OpeningHours = NULLIF(LTRIM(RTRIM(@OpeningHours)), N'');

  IF @IDActor IS NULL OR @IDBranch IS NULL OR ISNULL(@Name, N'') = N'' OR ISNULL(@Line1, N'') = N''
     OR ISNULL(@Municipality, N'') = N'' OR ISNULL(@Department, N'') = N''
    THROW 50400, 'IDActor, IDBranch, Name, Line1, Municipality and Department are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the branches.', 1;

  DECLARE @IsActive BIT = (SELECT IsActive FROM dbo.Branches WITH (UPDLOCK, ROWLOCK) WHERE IDBranch = @IDBranch);
  IF @IsActive IS NULL
    THROW 50404, 'Branch not found.', 1;
  IF @IsActive = 0
    THROW 50422, 'BRANCH_INACTIVE: A deactivated branch cannot be edited; create a new one.', 1;

  IF EXISTS (SELECT 1 FROM dbo.Branches WHERE Name = @Name AND IsActive = 1 AND IDBranch <> @IDBranch)
    THROW 50409, 'BRANCH_NAME_IN_USE: An active branch with that name already exists.', 1;

  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDBranch AS NVARCHAR(40));
  DECLARE @Old NVARCHAR(MAX) = (SELECT b.IDBranch, b.Name, b.Line1, b.Municipality, b.Department, b.Phone, b.OpeningHours, b.IsActive
                                FROM dbo.Branches AS b WHERE b.IDBranch = @IDBranch
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

  BEGIN TRY
    UPDATE dbo.Branches
    SET Name = @Name, Line1 = @Line1, Municipality = @Municipality, Department = @Department,
        Phone = @Phone, OpeningHours = @OpeningHours, UpdatedAt = SYSUTCDATETIME()
    WHERE IDBranch = @IDBranch;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'BRANCH_NAME_IN_USE: An active branch with that name already exists.', 1;
    THROW;
  END CATCH;

  DECLARE @New NVARCHAR(MAX) = (SELECT b.IDBranch, b.Name, b.Line1, b.Municipality, b.Department, b.Phone, b.OpeningHours, b.IsActive
                                FROM dbo.Branches AS b WHERE b.IDBranch = @IDBranch
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
  EXEC dbo.SP_Audit_Record @Module = N'Branches', @EntityName = N'Branch', @EntityKey = @EntityKey, @Action = N'Update',
       @PreviousValue = @Old, @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
