/* =====================================================================
   Objeto   : dbo.SP_Products_Deactivate
   Version  : 1.0.0
   Cambio   : Primera versión: retira un producto del catálogo junto con todas sus variantes
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404, 50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Products_Deactivate
  @IDActor   INT,
  @IDProduct INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDProduct IS NULL
    THROW 50400, 'IDActor and IDProduct are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  DECLARE @IsActive BIT = (SELECT IsActive FROM dbo.Products WITH (UPDLOCK, ROWLOCK) WHERE IDProduct = @IDProduct);
  IF @IsActive IS NULL
    THROW 50404, 'Product not found.', 1;

  IF @IsActive = 1
  BEGIN
    UPDATE dbo.Products SET IsActive = 0 WHERE IDProduct = @IDProduct;

    -- Las variantes se desactivan con el producto: SP_Inventory_ReserveStock solo mira la variante, así que un carrito
    -- que aún la contenga dejaría de poder reservarla. Las reservas ya hechas y los pedidos existentes no se tocan.
    UPDATE dbo.Variants SET IsActive = 0 WHERE IDProduct = @IDProduct AND IsActive = 1;

    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDProduct AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Product', @EntityKey = @EntityKey, @Action = N'Deactivate',
         @PreviousValue = N'{"IsActive":true}', @NewValue = N'{"IsActive":false}', @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
