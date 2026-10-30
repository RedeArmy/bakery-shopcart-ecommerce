/* =====================================================================
   Objeto   : dbo.SP_Products_Create
   Version  : 1.0.0
   Cambio   : Primera versión: alta de un producto (sus variantes y su precio se crean aparte)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 categoría inexistente o inactiva, 50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Products_Create
  @IDActor      INT,
  @IDCategory   INT,
  @Name         NVARCHAR(150),
  @Description  NVARCHAR(1000) = NULL,
  @LeadTimeDays TINYINT        = 0,
  @IDProduct    INT            OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Name = LTRIM(RTRIM(@Name));
  SET @Description = NULLIF(LTRIM(RTRIM(@Description)), N'');

  IF @IDActor IS NULL OR @IDCategory IS NULL OR ISNULL(@Name, N'') = N'' OR @LeadTimeDays IS NULL
    THROW 50400, 'IDActor, IDCategory, Name and LeadTimeDays are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE IDCategory = @IDCategory AND IsActive = 1)
    THROW 50404, 'Category not found.', 1;

  INSERT INTO dbo.Products (IDCategory, Name, Description, LeadTimeDays) VALUES (@IDCategory, @Name, @Description, @LeadTimeDays);
  SET @IDProduct = SCOPE_IDENTITY();

  DECLARE @New NVARCHAR(MAX) = (SELECT p.IDProduct, p.IDCategory, p.Name, p.Description, p.LeadTimeDays, p.IsActive
                                FROM dbo.Products AS p WHERE p.IDProduct = @IDProduct
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDProduct AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Product', @EntityKey = @EntityKey, @Action = N'Create',
       @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
