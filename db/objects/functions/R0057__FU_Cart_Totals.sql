/* =====================================================================
   Objeto   : dbo.FU_Cart_Totals
   Version  : 1.0.0
   Cambio   : Primera versión: subtotal, descuento, envío, total e IVA de un carrito, en centavos enteros
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila por carrito existente; cero filas si no existe. La reutilizará la creación del pedido.
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
    -- El descuento solo cuenta si el cupón sigue siendo aplicable hoy: uno vencido o agotado después de aplicarse al
    -- carrito deja de descontar, pero el carrito conserva el cupón para poder explicar por qué (CouponReason)
    SELECT c.IDCart,
           CouponReason = CASE WHEN c.IDCoupon IS NULL THEN CAST(NULL AS VARCHAR(20)) ELSE s.Reason END,
           DiscountCents = CASE WHEN c.IDCoupon IS NOT NULL AND s.Reason = 'Valid' THEN cp.RawDiscountCents ELSE 0 END
    FROM Cart AS c
    JOIN Coupon AS cp ON cp.IDCart = c.IDCart
    CROSS APPLY dbo.FU_Coupons_Status(c.IDCoupon, c.IDUser, cp.EligibleCents, @Now) AS s
  ),
  Settings AS (
    SELECT ShippingCents = ISNULL((SELECT CAST(TRY_CAST(SettingValue AS DECIMAL(18,2)) * 100 AS BIGINT) FROM dbo.Configuration WHERE SettingKey = N'ShippingCost'), 0),
           FreeFromCents = (SELECT CAST(TRY_CAST(SettingValue AS DECIMAL(18,2)) * 100 AS BIGINT) FROM dbo.Configuration WHERE SettingKey = N'FreeShippingFrom'),
           VatRate = ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'VatRate'), 12)
  ),
  Amounts AS (
    SELECT a.IDCart, s.SubtotalCents, a.DiscountCents, a.CouponReason,
           NetCents = CASE WHEN s.SubtotalCents - a.DiscountCents > 0 THEN s.SubtotalCents - a.DiscountCents ELSE 0 END,
           st.ShippingCents, st.FreeFromCents, st.VatRate
    FROM Applied AS a CROSS JOIN Subtotal AS s CROSS JOIN Settings AS st
  ),
  Shipped AS (
    -- El envío es gratis desde el monto configurado, comparado con el subtotal YA descontado (diseño §13). Un carrito
    -- vacío no envía nada.
    SELECT *, Shipping = CASE WHEN SubtotalCents = 0 THEN 0
                              WHEN FreeFromCents IS NOT NULL AND NetCents >= FreeFromCents THEN 0
                              ELSE ShippingCents END
    FROM Amounts
  )
  SELECT h.IDCart, h.SubtotalCents, h.DiscountCents, ShippingCents = h.Shipping,
         TotalCents = h.NetCents + h.Shipping, v.VatCents, v.BaseCents, h.CouponReason
  FROM Shipped AS h
  CROSS APPLY dbo.FU_Money_VatIncluded(h.NetCents + h.Shipping, h.VatRate) AS v;
GO
