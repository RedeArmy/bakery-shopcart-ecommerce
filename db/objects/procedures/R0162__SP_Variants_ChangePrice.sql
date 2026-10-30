/* =====================================================================
   Objeto   : dbo.SP_Variants_ChangePrice
   Version  : 1.0.0
   Cambio   : Primera versión: cambia el precio de una variante y deja el valor anterior en la bitácora
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404, 50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Variants_ChangePrice
  @IDActor   INT,
  @IDVariant INT,
  @NewPrice  DECIMAL(18,2)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDVariant IS NULL OR @NewPrice IS NULL OR @NewPrice <= 0
    THROW 50400, 'IDActor, IDVariant and a NewPrice greater than zero are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage the catalogue.', 1;

  DECLARE @CurrentPrice DECIMAL(18,2) = (SELECT Price FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant);
  IF @CurrentPrice IS NULL
    THROW 50404, 'Variant not found.', 1;

  -- Los pedidos ya creados guardan su propio precio (OrderLines, con trigger de inmutabilidad): cambiar el precio solo
  -- afecta a las compras futuras. Repetir el mismo precio no deja entrada en la bitácora.
  IF @CurrentPrice <> @NewPrice
  BEGIN
    UPDATE dbo.Variants SET Price = @NewPrice WHERE IDVariant = @IDVariant;

    -- El precio se registra como texto con dos decimales, igual que viaja por la API (ADR-0020)
    DECLARE @Previous NVARCHAR(100) = CONCAT(N'{"Price":"', CAST(@CurrentPrice AS VARCHAR(20)), N'"}');
    DECLARE @New NVARCHAR(100) = CONCAT(N'{"Price":"', CAST(@NewPrice AS VARCHAR(20)), N'"}');
    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDVariant AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Prices', @EntityName = N'Variant', @EntityKey = @EntityKey, @Action = N'Update',
         @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
