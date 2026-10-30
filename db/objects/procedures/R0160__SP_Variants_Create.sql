/* =====================================================================
   Objeto   : dbo.SP_Variants_Create
   Version  : 1.0.0
   Cambio   : Primera versión: alta de una variante con su precio inicial; nace sin existencias
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 producto inexistente, 50409 SKU repetido, 50422 actor sin permiso o producto inactivo.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Variants_Create
  @IDActor    INT,
  @IDProduct  INT,
  @SKU        NVARCHAR(40),
  @Price      DECIMAL(18,2),
  @Attributes NVARCHAR(MAX) = NULL,
  @IDVariant  INT           OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @SKU = LTRIM(RTRIM(@SKU));

  IF @IDActor IS NULL OR @IDProduct IS NULL OR ISNULL(@SKU, N'') = N'' OR @Price IS NULL OR @Price <= 0
    THROW 50400, 'IDActor, IDProduct, SKU and a Price greater than zero are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  DECLARE @ProductActive BIT = (SELECT IsActive FROM dbo.Products WHERE IDProduct = @IDProduct);
  IF @ProductActive IS NULL
    THROW 50404, 'Product not found.', 1;
  IF @ProductActive = 0
    THROW 50422, 'A variant cannot be added to an inactive product.', 1;

  IF EXISTS (SELECT 1 FROM dbo.Variants WHERE SKU = @SKU)
    THROW 50409, 'A variant with that SKU already exists.', 1;

  -- La variante nace con OnHandStock = 0: las existencias solo entran por el libro de inventario, para que el contador
  -- y el libro nunca discrepen
  BEGIN TRY
    INSERT INTO dbo.Variants (IDProduct, SKU, Price) VALUES (@IDProduct, @SKU, @Price);
    SET @IDVariant = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'A variant with that SKU already exists.', 1;
    THROW;
  END CATCH;

  EXEC dbo.SP_Variants_SetAttributes @IDVariant = @IDVariant, @Attributes = @Attributes;

  DECLARE @New NVARCHAR(MAX) = (SELECT v.IDVariant, v.IDProduct, v.SKU, Price = CAST(v.Price AS VARCHAR(20)), v.IsActive
                                FROM dbo.Variants AS v WHERE v.IDVariant = @IDVariant
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDVariant AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Variant', @EntityKey = @EntityKey, @Action = N'Create',
       @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
