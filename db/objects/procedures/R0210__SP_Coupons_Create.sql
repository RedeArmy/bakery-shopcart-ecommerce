/* =====================================================================
   Objeto   : dbo.SP_Coupons_Create
   Version  : 1.0.0
   Cambio   : Primera versión: alta de un cupón por un administrador
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Errores: 50400 datos inválidos, 50404 categoría inexistente, 50409 código repetido,
              50422 actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Coupons_Create
  @IDActor               INT,
  @Code                  NVARCHAR(30),
  @Type                  NVARCHAR(12),
  @Value                 DECIMAL(18,2),
  @MinimumAmount         DECIMAL(18,2) = 0,
  @StartsAt              DATETIME2(3),
  @EndsAt                DATETIME2(3),
  @TotalUsageLimit       INT           = NULL,
  @PerCustomerUsageLimit INT           = NULL,
  @IDCategory            INT           = NULL,
  @IDCoupon              INT           OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  -- El código se guarda en mayúsculas: el cliente escribe "bienvenido10" o "BIENVENIDO10" y es el mismo cupón
  SET @Code = UPPER(LTRIM(RTRIM(@Code)));
  SET @MinimumAmount = ISNULL(@MinimumAmount, 0);

  IF @IDActor IS NULL OR ISNULL(@Code, N'') = N'' OR @Type NOT IN (N'Percentage', N'FixedAmount') OR @Value IS NULL OR @Value <= 0
     OR (@Type = N'Percentage' AND @Value > 100) OR @MinimumAmount < 0 OR @StartsAt IS NULL OR @EndsAt IS NULL OR @EndsAt <= @StartsAt
     OR @TotalUsageLimit <= 0 OR @PerCustomerUsageLimit <= 0
    THROW 50400, 'A Code, a Type (Percentage or FixedAmount), a Value above zero (up to 100 for a percentage), a MinimumAmount of zero or more, valid dates and positive limits are required.', 1;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT 1 FROM dbo.FU_Users_ActiveAdministrator(@IDActor))
    THROW 50422, 'Only an active administrator can manage coupons.', 1;

  IF @IDCategory IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE IDCategory = @IDCategory AND IsActive = 1)
    THROW 50404, 'Category not found.', 1;

  IF EXISTS (SELECT 1 FROM dbo.Coupons WHERE Code = @Code)
    THROW 50409, 'A coupon with that code already exists.', 1;

  BEGIN TRY
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, TotalUsageLimit, PerCustomerUsageLimit, IDCategory)
    VALUES (@Code, @Type, @Value, @MinimumAmount, @StartsAt, @EndsAt, @TotalUsageLimit, @PerCustomerUsageLimit, @IDCategory);
    SET @IDCoupon = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'A coupon with that code already exists.', 1;
    THROW;
  END CATCH;

  -- Los importes de la bitácora son texto con dos decimales (ADR-0020)
  DECLARE @New NVARCHAR(MAX) = (SELECT c.IDCoupon, c.Code, c.Type, Value = CAST(c.Value AS VARCHAR(25)), MinimumAmount = CAST(c.MinimumAmount AS VARCHAR(25)),
                                       c.StartsAt, c.EndsAt, c.TotalUsageLimit, c.PerCustomerUsageLimit, c.IDCategory, c.IsActive
                                FROM dbo.Coupons AS c WHERE c.IDCoupon = @IDCoupon
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDCoupon AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Coupons', @EntityName = N'Coupon', @EntityKey = @EntityKey, @Action = N'Create',
       @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
