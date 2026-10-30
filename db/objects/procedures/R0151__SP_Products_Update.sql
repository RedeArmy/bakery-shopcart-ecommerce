/* =====================================================================
   Objeto   : dbo.SP_Products_Update
   Version  : 1.0.0
   Cambio   : Primera versión: edición de un producto con concurrencia optimista opcional
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 producto o categoría inexistente, 50409 el producto cambió mientras se editaba,
              50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Products_Update
  @IDActor      INT,
  @IDProduct    INT,
  @IDCategory   INT,
  @Name         NVARCHAR(150),
  @Description  NVARCHAR(1000) = NULL,
  @LeadTimeDays TINYINT        = 0,
  -- La versión de fila que el panel leyó al abrir el formulario; si se envía y ya cambió, la edición se rechaza
  @RowVer       BINARY(8)      = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Name = LTRIM(RTRIM(@Name));
  SET @Description = NULLIF(LTRIM(RTRIM(@Description)), N'');

  IF @IDActor IS NULL OR @IDProduct IS NULL OR @IDCategory IS NULL OR ISNULL(@Name, N'') = N'' OR @LeadTimeDays IS NULL
    THROW 50400, 'IDActor, IDProduct, IDCategory, Name and LeadTimeDays are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  DECLARE @CurrentRowVer BINARY(8) = (SELECT CAST(RowVer AS BINARY(8)) FROM dbo.Products WITH (UPDLOCK, ROWLOCK) WHERE IDProduct = @IDProduct);
  IF @CurrentRowVer IS NULL
    THROW 50404, 'Product not found.', 1;

  IF @RowVer IS NOT NULL AND @RowVer <> @CurrentRowVer
    THROW 50409, 'The product was modified by someone else.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE IDCategory = @IDCategory AND IsActive = 1)
    THROW 50404, 'Category not found.', 1;

  DECLARE @Previous NVARCHAR(MAX) = (SELECT p.IDProduct, p.IDCategory, p.Name, p.Description, p.LeadTimeDays, p.IsActive
                                     FROM dbo.Products AS p WHERE p.IDProduct = @IDProduct
                                     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

  UPDATE dbo.Products SET IDCategory = @IDCategory, Name = @Name, Description = @Description, LeadTimeDays = @LeadTimeDays
  WHERE IDProduct = @IDProduct;

  DECLARE @New NVARCHAR(MAX) = (SELECT p.IDProduct, p.IDCategory, p.Name, p.Description, p.LeadTimeDays, p.IsActive
                                FROM dbo.Products AS p WHERE p.IDProduct = @IDProduct
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

  IF @Previous <> @New
  BEGIN
    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDProduct AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Product', @EntityKey = @EntityKey, @Action = N'Update',
         @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
