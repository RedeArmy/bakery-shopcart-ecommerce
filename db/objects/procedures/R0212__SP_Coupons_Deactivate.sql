/* =====================================================================
   Objeto   : dbo.SP_Coupons_Deactivate
   Version  : 1.0.0
   Cambio   : Primera versión: retira un cupón; los pedidos que ya lo usaron no cambian
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404, 50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Coupons_Deactivate
  @IDActor  INT,
  @IDCoupon INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDActor IS NULL OR @IDCoupon IS NULL
    THROW 50400, 'IDActor and IDCoupon are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage coupons.', 1;

  DECLARE @IsActive BIT = (SELECT IsActive FROM dbo.Coupons WITH (UPDLOCK, ROWLOCK) WHERE IDCoupon = @IDCoupon);
  IF @IsActive IS NULL
    THROW 50404, 'Coupon not found.', 1;

  -- Desactivar es idempotente. Un carrito que ya tenía el cupón deja de recibir el descuento (FU_Cart_Totals lo comprueba
  -- cada vez); un pedido ya creado conserva el suyo porque guarda el monto congelado.
  IF @IsActive = 1
  BEGIN
    UPDATE dbo.Coupons SET IsActive = 0 WHERE IDCoupon = @IDCoupon;

    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDCoupon AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Coupons', @EntityName = N'Coupon', @EntityKey = @EntityKey, @Action = N'Deactivate',
         @PreviousValue = N'{"IsActive":true}', @NewValue = N'{"IsActive":false}', @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
