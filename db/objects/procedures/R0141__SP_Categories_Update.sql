/* =====================================================================
   Objeto   : dbo.SP_Categories_Update
   Version  : 1.0.0
   Cambio   : Primera versión: edición de una categoría (reemplazo completo de sus datos)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 categoría o padre inexistente, 50409 nombre repetido,
              50422 actor sin permiso o jerarquía circular.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Categories_Update
  @IDActor          INT,
  @IDCategory       INT,
  @Name             NVARCHAR(80),
  @Description      NVARCHAR(300) = NULL,
  @IDParentCategory INT           = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Name = LTRIM(RTRIM(@Name));
  SET @Description = NULLIF(LTRIM(RTRIM(@Description)), N'');

  IF @IDActor IS NULL OR @IDCategory IS NULL OR ISNULL(@Name, N'') = N''
    THROW 50400, 'IDActor, IDCategory and Name are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.Categories WITH (UPDLOCK, ROWLOCK) WHERE IDCategory = @IDCategory)
    THROW 50404, 'Category not found.', 1;

  IF @IDParentCategory IS NOT NULL
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE IDCategory = @IDParentCategory AND IsActive = 1)
      THROW 50404, 'Parent category not found.', 1;

    -- Un padre que sea la propia categoría o una de sus descendientes cerraría un ciclo y el árbol dejaría de tener raíz
    IF @IDParentCategory = @IDCategory
      THROW 50422, 'A category cannot be its own ancestor.', 1;

    DECLARE @CreatesCycle BIT = 0;
    WITH Descendants AS (
      SELECT IDCategory FROM dbo.Categories WHERE IDParentCategory = @IDCategory
      UNION ALL
      SELECT c.IDCategory FROM dbo.Categories AS c JOIN Descendants AS d ON c.IDParentCategory = d.IDCategory
    )
    SELECT @CreatesCycle = 1 FROM Descendants WHERE IDCategory = @IDParentCategory;
    IF @CreatesCycle = 1
      THROW 50422, 'A category cannot be its own ancestor.', 1;
  END;

  IF EXISTS (SELECT 1 FROM dbo.Categories WHERE Name = @Name AND IDCategory <> @IDCategory)
    THROW 50409, 'A category with that name already exists.', 1;

  DECLARE @Previous NVARCHAR(MAX) = (SELECT c.IDCategory, c.IDParentCategory, c.Name, c.Description, c.IsActive
                                     FROM dbo.Categories AS c WHERE c.IDCategory = @IDCategory
                                     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

  BEGIN TRY
    UPDATE dbo.Categories SET Name = @Name, Description = @Description, IDParentCategory = @IDParentCategory WHERE IDCategory = @IDCategory;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'A category with that name already exists.', 1;
    THROW;
  END CATCH;

  DECLARE @New NVARCHAR(MAX) = (SELECT c.IDCategory, c.IDParentCategory, c.Name, c.Description, c.IsActive
                                FROM dbo.Categories AS c WHERE c.IDCategory = @IDCategory
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

  -- Guardar los mismos datos no deja rastro: la bitácora solo registra cambios reales
  IF @Previous <> @New
  BEGIN
    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDCategory AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Categories', @EntityName = N'Category', @EntityKey = @EntityKey, @Action = N'Update',
         @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
