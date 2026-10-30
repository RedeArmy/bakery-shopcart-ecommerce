/* =====================================================================
   Objeto   : dbo.SP_Variants_Update
   Version  : 1.0.0
   Cambio   : Primera versión: edición del SKU, el estado y los atributos de una variante (el precio va aparte)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404, 50409 SKU repetido, 50422 actor sin permiso o producto inactivo.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Variants_Update
  @IDActor    INT,
  @IDVariant  INT,
  @SKU        NVARCHAR(40),
  @IsActive   BIT,
  -- NULL deja los atributos como están; [] los borra
  @Attributes NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @SKU = LTRIM(RTRIM(@SKU));

  IF @IDActor IS NULL OR @IDVariant IS NULL OR ISNULL(@SKU, N'') = N'' OR @IsActive IS NULL
    THROW 50400, 'IDActor, IDVariant, SKU and IsActive are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  DECLARE @IDProduct INT = (SELECT IDProduct FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant);
  IF @IDProduct IS NULL
    THROW 50404, 'Variant not found.', 1;

  -- Reactivar una variante de un producto retirado la haría comprable sin que el producto aparezca en el catálogo
  IF @IsActive = 1 AND NOT EXISTS (SELECT 1 FROM dbo.Products WHERE IDProduct = @IDProduct AND IsActive = 1)
    THROW 50422, 'A variant of an inactive product cannot be activated.', 1;

  IF EXISTS (SELECT 1 FROM dbo.Variants WHERE SKU = @SKU AND IDVariant <> @IDVariant)
    THROW 50409, 'A variant with that SKU already exists.', 1;

  DECLARE @Previous NVARCHAR(MAX) = (SELECT v.IDVariant, v.SKU, v.IsActive,
                                            Attributes = (SELECT Name = a.Name, va.Value FROM dbo.VariantAttributes AS va
                                                          JOIN dbo.Attributes AS a ON a.IDAttribute = va.IDAttribute
                                                          WHERE va.IDVariant = v.IDVariant ORDER BY a.Name FOR JSON PATH)
                                     FROM dbo.Variants AS v WHERE v.IDVariant = @IDVariant FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

  BEGIN TRY
    UPDATE dbo.Variants SET SKU = @SKU, IsActive = @IsActive WHERE IDVariant = @IDVariant;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'A variant with that SKU already exists.', 1;
    THROW;
  END CATCH;

  EXEC dbo.SP_Variants_SetAttributes @IDVariant = @IDVariant, @Attributes = @Attributes;

  DECLARE @New NVARCHAR(MAX) = (SELECT v.IDVariant, v.SKU, v.IsActive,
                                       Attributes = (SELECT Name = a.Name, va.Value FROM dbo.VariantAttributes AS va
                                                     JOIN dbo.Attributes AS a ON a.IDAttribute = va.IDAttribute
                                                     WHERE va.IDVariant = v.IDVariant ORDER BY a.Name FOR JSON PATH)
                                FROM dbo.Variants AS v WHERE v.IDVariant = @IDVariant FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

  IF @Previous <> @New
  BEGIN
    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDVariant AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Variant', @EntityKey = @EntityKey, @Action = N'Update',
         @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
