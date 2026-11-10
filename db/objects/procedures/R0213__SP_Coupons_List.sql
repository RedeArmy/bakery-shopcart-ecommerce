/* =====================================================================
   Objeto   : dbo.SP_Coupons_List
   Version  : 1.2.0
   Cambio   : 1.2.0: el estado Expired lista los cupones activos cuya fecha de fin ya pasó.
              1.1.0: filtro por estado (@Status): todos, solo los vigentes ahora o solo los desactivados.
              1.0.0: Primera versión: listado paginado de cupones para el panel de administración
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Sin @Status se comporta como 1.0.0 (@IncludeInactive decide). Con @Status manda este: All todos, Active los vigentes
              (activos, ya empezados, no vencidos y no agotados), Inactive los desactivados, Expired los activos ya vencidos. Los montos van como texto con dos
              decimales. Errores: 50400 paginación o estado inválidos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Coupons_List
  @IncludeInactive BIT          = 0,
  @Status          VARCHAR(10)  = NULL,
  @Now             DATETIME2(3) = NULL,
  @PageNumber      INT          = 1,
  @PageSize        INT          = 20
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @PageNumber < 1 OR @PageSize < 1 OR @PageSize > 100
    THROW 50400, 'PageNumber must be at least 1 and PageSize between 1 and 100.', 1;

  IF @Status IS NOT NULL AND @Status NOT IN ('All', 'Active', 'Inactive', 'Expired')
    THROW 50400, 'Status must be All, Active, Inactive or Expired.', 1;

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
  WHERE CASE
          WHEN @Status IS NULL THEN CASE WHEN c.IsActive = 1 OR ISNULL(@IncludeInactive, 0) = 1 THEN 1 ELSE 0 END
          WHEN @Status = 'All' THEN 1
          WHEN @Status = 'Inactive' THEN CASE WHEN c.IsActive = 0 THEN 1 ELSE 0 END
          WHEN @Status = 'Expired' THEN CASE WHEN c.IsActive = 1 AND @Now > c.EndsAt THEN 1 ELSE 0 END
          -- Vigente es lo que hoy se puede aplicar: la misma condición que el estado «Active» de arriba
          ELSE CASE WHEN c.IsActive = 1 AND @Now >= c.StartsAt AND @Now <= c.EndsAt
                         AND (c.TotalUsageLimit IS NULL OR c.UsageCount < c.TotalUsageLimit) THEN 1 ELSE 0 END
        END = 1
  ORDER BY c.IDCoupon DESC
  OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
