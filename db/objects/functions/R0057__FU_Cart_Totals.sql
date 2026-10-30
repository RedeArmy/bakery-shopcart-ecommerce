/* =====================================================================
   Objeto   : dbo.FU_Cart_Totals
   Version  : 1.0.0
   Cambio   : Primera versión: subtotal, descuento, total e IVA de un carrito, en centavos enteros
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila por carrito existente; cero filas si no existe. La reutilizará la creación del pedido.
              No hay envío: el enunciado no lo pide, así que el total es el subtotal menos el descuento.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Cart_Totals (@IDCart INT, @Now DATETIME2(3))
RETURNS TABLE
AS
RETURN
  WITH Cart AS (
    SELECT IDCart, IDUser, IDCoupon FROM dbo.Carts WHERE IDCart = @IDCart
  ),
  Subtotal AS (
    SELECT SubtotalCents = ISNULL(SUM(CAST(v.Price * 100 AS BIGINT) * ci.Quantity), 0)
    FROM dbo.CartItems AS ci JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
    WHERE ci.IDCart = @IDCart
  ),
  Coupon AS (
    -- Una fila por carrito: el descuento y lo elegible son iguales en todas las líneas
    SELECT c.IDCart,
           EligibleCents = ISNULL(MAX(d.EligibleCents), 0),
           RawDiscountCents = ISNULL(MAX(d.TotalDiscountCents), 0)
    FROM Cart AS c
    OUTER APPLY dbo.FU_Coupons_DiscountCalculation(c.IDCart, c.IDCoupon) AS d
    GROUP BY c.IDCart
  ),
  Applied AS (
    -- El descuento solo cuenta si el cupón sigue siendo aplicable hoy: uno vencido, agotado o ya usado después de aplicarse
    -- al carrito deja de descontar, pero el carrito conserva el cupón para poder explicar por qué (CouponReason)
    SELECT c.IDCart,
           CouponReason = CASE WHEN c.IDCoupon IS NULL THEN CAST(NULL AS VARCHAR(20)) ELSE s.Reason END,
           DiscountCents = CASE WHEN c.IDCoupon IS NOT NULL AND s.Reason = 'Valid' THEN cp.RawDiscountCents ELSE 0 END
    FROM Cart AS c
    JOIN Coupon AS cp ON cp.IDCart = c.IDCart
    CROSS APPLY dbo.FU_Coupons_Status(c.IDCoupon, c.IDUser, cp.EligibleCents, @Now) AS s
  ),
  Amounts AS (
    SELECT a.IDCart, s.SubtotalCents, a.DiscountCents, a.CouponReason,
           TotalCents = CASE WHEN s.SubtotalCents - a.DiscountCents > 0 THEN s.SubtotalCents - a.DiscountCents ELSE 0 END,
           VatRate = ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'VatRate'), 12)
    FROM Applied AS a CROSS JOIN Subtotal AS s
  )
  -- Los precios ya incluyen IVA (ADR-0008): se separa del total con FU_Money_VatIncluded
  SELECT m.IDCart, m.SubtotalCents, m.DiscountCents, m.TotalCents, v.VatCents, v.BaseCents, m.CouponReason
  FROM Amounts AS m
  CROSS APPLY dbo.FU_Money_VatIncluded(m.TotalCents, m.VatRate) AS v;
GO
