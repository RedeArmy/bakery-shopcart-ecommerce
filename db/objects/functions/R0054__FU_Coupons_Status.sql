/* =====================================================================
   Objeto   : dbo.FU_Coupons_Status
   Version  : 1.1.0
   Cambio   : El límite por cliente cuenta por correo normalizado
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila siempre. Reason: Valid, NotFound, Inactive, NotStarted, Expired, Exhausted, PerCustomerLimit,
              NoEligibleItems o BelowMinimum, en ese orden de precedencia.
   Cambio 1.1.0: la firma y las razones son las mismas; con correos que no son alias entre sí el resultado no cambia.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Coupons_Status (@IDCoupon INT, @IDUser INT, @EligibleCents BIGINT, @Now DATETIME2(3))
RETURNS TABLE
AS
RETURN
  -- El orden de las condiciones decide el mensaje cuando hay varios problemas a la vez: primero lo que el cliente no
  -- puede arreglar (vencido, agotado) y al final lo que sí (llegar al mínimo). Los extremos de la vigencia son inclusivos.
  SELECT Reason = CAST(CASE
      WHEN c.IDCoupon IS NULL THEN 'NotFound'
      WHEN c.IsActive = 0 THEN 'Inactive'
      WHEN @Now < c.StartsAt THEN 'NotStarted'
      WHEN @Now > c.EndsAt THEN 'Expired'
      WHEN c.TotalUsageLimit IS NOT NULL AND c.UsageCount >= c.TotalUsageLimit THEN 'Exhausted'
      WHEN c.PerCustomerUsageLimit IS NOT NULL
           -- El cliente es la persona detrás de la clave del correo (Users.EmailKey, V0014): los usos de cualquier cuenta cuyo
           -- correo normalizado coincide cuentan juntos. Sin esto, abrir otra cuenta con `ana+2@...` o `a.na@gmail.com`
           -- reiniciaría un límite de un uso por cliente.
           AND (SELECT COUNT(*) FROM dbo.CouponUsages AS cu
                WHERE cu.IDCoupon = c.IDCoupon AND cu.IsVoided = 0
                  AND cu.IDUser IN (SELECT u.IDUser FROM dbo.Users AS u
                                    WHERE u.EmailKey = (SELECT me.EmailKey FROM dbo.Users AS me WHERE me.IDUser = @IDUser))
               ) >= c.PerCustomerUsageLimit THEN 'PerCustomerLimit'
      WHEN ISNULL(@EligibleCents, 0) <= 0 THEN 'NoEligibleItems'
      WHEN @EligibleCents < CAST(c.MinimumAmount * 100 AS BIGINT) THEN 'BelowMinimum'
      ELSE 'Valid' END AS VARCHAR(20))
  FROM (SELECT One = 1) AS x
  LEFT JOIN dbo.Coupons AS c ON c.IDCoupon = @IDCoupon;
GO
