/* =====================================================================
   Objeto   : dbo.SP_Coupons_Reactivate
   Version  : 1.0.0
   Cambio   : Primera versión: vuelve a activar un cupón desactivado
   Autor    : Equipo ShopCart   Fecha: 2026-11-09
   Compat   : Nueva. Es idempotente: activar un cupón que ya está activo no cambia nada. Sus fechas y sus usos no se tocan: si su
              vigencia ya pasó, sigue vencido hasta que se edite. Errores: 50400, 50404 cupón inexistente, 50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Coupons_Reactivate
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

  IF @IsActive = 0
  BEGIN
    UPDATE dbo.Coupons SET IsActive = 1 WHERE IDCoupon = @IDCoupon;

    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDCoupon AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Coupons', @EntityName = N'Coupon', @EntityKey = @EntityKey, @Action = N'StatusChange',
         @PreviousValue = N'{"IsActive":false}', @NewValue = N'{"IsActive":true}', @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
