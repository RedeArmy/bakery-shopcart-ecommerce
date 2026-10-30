/* =====================================================================
   Objeto   : dbo.SP_Categories_Deactivate
   Version  : 1.0.0
   Cambio   : Primera versión: desactiva una categoría que ya no tiene productos ni subcategorías activos
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404, 50422 actor sin permiso o categoría todavía en uso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Categories_Deactivate
  @IDActor    INT,
  @IDCategory INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDCategory IS NULL
    THROW 50400, 'IDActor and IDCategory are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  DECLARE @IsActive BIT = (SELECT IsActive FROM dbo.Categories WITH (UPDLOCK, ROWLOCK) WHERE IDCategory = @IDCategory);
  IF @IsActive IS NULL
    THROW 50404, 'Category not found.', 1;

  -- Desactivar es idempotente: repetirlo no es un error ni deja otra entrada en la bitácora
  IF @IsActive = 1
  BEGIN
    -- Desactivarla con productos dentro los dejaría colgando de una categoría que el catálogo ya no muestra
    IF EXISTS (SELECT 1 FROM dbo.Products WHERE IDCategory = @IDCategory AND IsActive = 1)
       OR EXISTS (SELECT 1 FROM dbo.Categories WHERE IDParentCategory = @IDCategory AND IsActive = 1)
      THROW 50422, 'The category still has active products or subcategories.', 1;

    UPDATE dbo.Categories SET IsActive = 0 WHERE IDCategory = @IDCategory;

    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDCategory AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Categories', @EntityName = N'Category', @EntityKey = @EntityKey, @Action = N'Deactivate',
         @PreviousValue = N'{"IsActive":true}', @NewValue = N'{"IsActive":false}', @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
