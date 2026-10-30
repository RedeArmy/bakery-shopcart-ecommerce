/* =====================================================================
   Objeto   : dbo.SP_Categories_Create
   Version  : 1.0.0
   Cambio   : Primera versión: alta de una categoría, con padre opcional
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 padre inexistente o inactivo, 50409 nombre repetido, 50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Categories_Create
  @IDActor          INT,
  @Name             NVARCHAR(80),
  @Description      NVARCHAR(300) = NULL,
  @IDParentCategory INT           = NULL,
  @IDCategory       INT           OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Name = LTRIM(RTRIM(@Name));
  SET @Description = NULLIF(LTRIM(RTRIM(@Description)), N'');

  IF @IDActor IS NULL OR ISNULL(@Name, N'') = N''
    THROW 50400, 'IDActor and Name are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  IF @IDParentCategory IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE IDCategory = @IDParentCategory AND IsActive = 1)
    THROW 50404, 'Parent category not found.', 1;

  IF EXISTS (SELECT 1 FROM dbo.Categories WHERE Name = @Name)
    THROW 50409, 'A category with that name already exists.', 1;

  -- Dos altas simultáneas con el mismo nombre pasan la comprobación anterior; el índice único decide cuál gana
  BEGIN TRY
    INSERT INTO dbo.Categories (IDParentCategory, Name, Description) VALUES (@IDParentCategory, @Name, @Description);
    SET @IDCategory = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'A category with that name already exists.', 1;
    THROW;
  END CATCH;

  DECLARE @New NVARCHAR(MAX) = (SELECT c.IDCategory, c.IDParentCategory, c.Name, c.Description, c.IsActive
                                FROM dbo.Categories AS c WHERE c.IDCategory = @IDCategory
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDCategory AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Categories', @EntityName = N'Category', @EntityKey = @EntityKey, @Action = N'Create',
       @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
