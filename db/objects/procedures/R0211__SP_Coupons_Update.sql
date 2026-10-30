/* =====================================================================
   Objeto   : dbo.SP_Coupons_Update
   Version  : 1.0.0
   Cambio   : Primera versión: edición de un cupón (reemplazo completo de sus condiciones; el código no cambia)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400, 50404 cupón o categoría inexistente, 50422 actor sin permiso o límite por debajo de los usos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Coupons_Update
  @IDActor               INT,
  @IDCoupon              INT,
  @Type                  NVARCHAR(12),
  @Value                 DECIMAL(18,2),
  @MinimumAmount         DECIMAL(18,2) = 0,
  @StartsAt              DATETIME2(3),
  @EndsAt                DATETIME2(3),
  @TotalUsageLimit       INT           = NULL,
  @PerCustomerUsageLimit INT           = NULL,
  @IDCategory            INT           = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @MinimumAmount = ISNULL(@MinimumAmount, 0);

  IF @IDActor IS NULL OR @IDCoupon IS NULL OR @Type NOT IN (N'Percentage', N'FixedAmount') OR @Value IS NULL OR @Value <= 0
     OR (@Type = N'Percentage' AND @Value > 100) OR @MinimumAmount < 0 OR @StartsAt IS NULL OR @EndsAt IS NULL OR @EndsAt <= @StartsAt
     OR @TotalUsageLimit <= 0 OR @PerCustomerUsageLimit <= 0
    THROW 50400, 'A Type (Percentage or FixedAmount), a Value above zero (up to 100 for a percentage), a MinimumAmount of zero or more, valid dates and positive limits are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage coupons.', 1;

  DECLARE @UsageCount INT = (SELECT UsageCount FROM dbo.Coupons WITH (UPDLOCK, ROWLOCK) WHERE IDCoupon = @IDCoupon);
  IF @UsageCount IS NULL
    THROW 50404, 'Coupon not found.', 1;

  IF @IDCategory IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE IDCategory = @IDCategory AND IsActive = 1)
    THROW 50404, 'Category not found.', 1;

  -- Un límite por debajo de los usos ya consumidos dejaría el cupón en un estado imposible; CK_Coupons_UsageVsLimit lo
  -- impediría con un error 547, aquí se avisa con el código del proyecto
  IF @TotalUsageLimit IS NOT NULL AND @TotalUsageLimit < @UsageCount
    THROW 50422, 'The total usage limit cannot be below the uses already consumed.', 1;

  DECLARE @Previous NVARCHAR(MAX) = (SELECT c.IDCoupon, c.Code, c.Type, Value = CAST(c.Value AS VARCHAR(25)), MinimumAmount = CAST(c.MinimumAmount AS VARCHAR(25)),
                                            c.StartsAt, c.EndsAt, c.TotalUsageLimit, c.PerCustomerUsageLimit, c.IDCategory, c.IsActive
                                     FROM dbo.Coupons AS c WHERE c.IDCoupon = @IDCoupon
                                     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

  UPDATE dbo.Coupons
  SET Type = @Type, Value = @Value, MinimumAmount = @MinimumAmount, StartsAt = @StartsAt, EndsAt = @EndsAt,
      TotalUsageLimit = @TotalUsageLimit, PerCustomerUsageLimit = @PerCustomerUsageLimit, IDCategory = @IDCategory
  WHERE IDCoupon = @IDCoupon;

  DECLARE @New NVARCHAR(MAX) = (SELECT c.IDCoupon, c.Code, c.Type, Value = CAST(c.Value AS VARCHAR(25)), MinimumAmount = CAST(c.MinimumAmount AS VARCHAR(25)),
                                       c.StartsAt, c.EndsAt, c.TotalUsageLimit, c.PerCustomerUsageLimit, c.IDCategory, c.IsActive
                                FROM dbo.Coupons AS c WHERE c.IDCoupon = @IDCoupon
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

  IF @Previous <> @New
  BEGIN
    DECLARE @EntityKey NVARCHAR(40) = CAST(@IDCoupon AS NVARCHAR(40));
    EXEC dbo.SP_Audit_Record @Module = N'Coupons', @EntityName = N'Coupon', @EntityKey = @EntityKey, @Action = N'Update',
         @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;
  END;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
