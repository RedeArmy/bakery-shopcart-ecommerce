/* =====================================================================
   Objeto   : dbo.SP_Coupons_Delete
   Version  : 1.0.0
   Cambio   : Primera versión: borra por completo un cupón que está desactivado y que ningún pedido usó
   Autor    : Equipo ShopCart   Fecha: 2026-11-09
   Compat   : Nueva. Es la única operación del sistema que borra una fila de negocio, y por eso es estricta: solo un cupón ya
              desactivado (50422 si está activo) y que nunca se usó en un pedido ni tiene usos registrados (50422 si no: ese cupón
              se conserva desactivado, porque el pedido lo cita). Los carritos que aún lo tenían lo pierden. La bitácora guarda el
              cupón tal como era; la acción es Deactivate porque la restricción de la bitácora no admite otra (ver decision-log).
              Errores: 50400, 50404 cupón inexistente, 50422 actor sin permiso, cupón activo o cupón usado.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Coupons_Delete
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
  IF @IsActive = 1
    THROW 50422, 'Only a deactivated coupon can be deleted.', 1;

  -- Un cupón que un pedido usó o cita se conserva: el pedido guarda su descuento congelado y su historial lo nombra
  IF EXISTS (SELECT 1 FROM dbo.Orders WHERE IDCoupon = @IDCoupon)
     OR EXISTS (SELECT 1 FROM dbo.CouponUsages WHERE IDCoupon = @IDCoupon)
    THROW 50422, 'A coupon that an order used cannot be deleted; it stays deactivated.', 1;

  -- La bitácora conserva el cupón entero antes de borrarlo
  DECLARE @Previous NVARCHAR(MAX) = (SELECT c.IDCoupon, c.Code, c.Type, Value = CAST(c.Value AS VARCHAR(25)),
                                            MinimumAmount = CAST(c.MinimumAmount AS VARCHAR(25)), c.StartsAt, c.EndsAt,
                                            c.TotalUsageLimit, c.PerCustomerUsageLimit, c.IDCategory, c.IsActive
                                     FROM dbo.Coupons AS c WHERE c.IDCoupon = @IDCoupon
                                     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

  -- Los carritos son pasajeros: quien lo tenía puesto pierde el cupón, que además ya no daba descuento por estar desactivado
  UPDATE dbo.Carts SET IDCoupon = NULL WHERE IDCoupon = @IDCoupon;
  DELETE FROM dbo.Coupons WHERE IDCoupon = @IDCoupon;

  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDCoupon AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Coupons', @EntityName = N'Coupon', @EntityKey = @EntityKey, @Action = N'Deactivate',
       @PreviousValue = @Previous, @NewValue = N'{"Deleted":true}', @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
