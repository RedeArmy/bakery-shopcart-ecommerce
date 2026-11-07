/* =====================================================================
   Objeto   : dbo.SP_Branches_Create
   Version  : 1.0.0
   Cambio   : Primera versión: alta de una sucursal
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. Errores: 50400, 50409 ya hay una sucursal activa con ese nombre, 50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Branches_Create
  @IDActor      INT,
  @Name         NVARCHAR(80),
  @Line1        NVARCHAR(200),
  @Municipality NVARCHAR(80),
  @Department   NVARCHAR(80),
  @Phone        NVARCHAR(20)  = NULL,
  @OpeningHours NVARCHAR(200) = NULL,
  @IDBranch     INT           = NULL OUTPUT
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

  IF @IDActor IS NULL OR ISNULL(@Name, N'') = N'' OR ISNULL(@Line1, N'') = N'' OR ISNULL(@Municipality, N'') = N'' OR ISNULL(@Department, N'') = N''
    THROW 50400, 'IDActor, Name, Line1, Municipality and Department are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the branches.', 1;

  IF EXISTS (SELECT 1 FROM dbo.Branches WHERE Name = @Name AND IsActive = 1)
    THROW 50409, 'BRANCH_NAME_IN_USE: An active branch with that name already exists.', 1;

  -- Dos altas simultáneas con el mismo nombre pasan la comprobación anterior; el índice único decide cuál gana
  BEGIN TRY
    INSERT INTO dbo.Branches (Name, Line1, Municipality, Department, Phone, OpeningHours)
    VALUES (@Name, @Line1, @Municipality, @Department, @Phone, @OpeningHours);
    SET @IDBranch = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'BRANCH_NAME_IN_USE: An active branch with that name already exists.', 1;
    THROW;
  END CATCH;

  DECLARE @New NVARCHAR(MAX) = (SELECT b.IDBranch, b.Name, b.Line1, b.Municipality, b.Department, b.Phone, b.OpeningHours, b.IsActive
                                FROM dbo.Branches AS b WHERE b.IDBranch = @IDBranch
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDBranch AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Branches', @EntityName = N'Branch', @EntityKey = @EntityKey, @Action = N'Create',
       @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
