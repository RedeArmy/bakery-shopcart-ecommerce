/* =====================================================================
   Objeto   : dbo.SP_Coupons_List
   Version  : 1.0.0
   Cambio   : Primera versión: listado paginado de cupones para el panel de administración
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Los montos van como texto con dos decimales. Errores: 50400 paginación inválida.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Coupons_List
  @IncludeInactive BIT          = 0,
  @Now             DATETIME2(3) = NULL,
  @PageNumber      INT          = 1,
  @PageSize        INT          = 20
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  -- Status resume el estado de vigencia y de usos sin depender de un cliente concreto; el límite por cliente no entra
  SELECT c.IDCoupon, c.Code, c.Type, Value = CAST(c.Value AS VARCHAR(25)), MinimumAmount = CAST(c.MinimumAmount AS VARCHAR(25)),
         c.StartsAt, c.EndsAt, c.TotalUsageLimit, c.PerCustomerUsageLimit, c.UsageCount, c.IDCategory, c.IsActive,
         Status = CASE WHEN c.IsActive = 0 THEN 'Inactive'
                       WHEN @Now < c.StartsAt THEN 'NotStarted'
                       WHEN @Now > c.EndsAt THEN 'Expired'
                       WHEN c.TotalUsageLimit IS NOT NULL AND c.UsageCount >= c.TotalUsageLimit THEN 'Exhausted'
                       ELSE 'Active' END,
         TotalCount = COUNT(*) OVER ()
  FROM dbo.Coupons AS c
  WHERE c.IsActive = 1 OR ISNULL(@IncludeInactive, 0) = 1
  ORDER BY c.IDCoupon DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
