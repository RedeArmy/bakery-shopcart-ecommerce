/* =====================================================================
   Objeto   : dbo.FU_Coupons_DiscountCalculation
   Version  : 1.0.0
   Cambio   : Primera versión: descuento de un cupón repartido por línea del carrito con el método del mayor resto
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila por línea del carrito. No valida el cupón (vigencia, usos): eso es FU_Coupons_Status.
              Cero filas si el carrito está vacío o el cupón no existe.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Coupons_DiscountCalculation (@IDCart INT, @IDCoupon INT)
RETURNS TABLE
AS
RETURN
  WITH Tree AS (
    -- Un cupón de categoría incluye a sus subcategorías, igual que el filtro del catálogo
    SELECT c.IDCategory FROM dbo.Coupons AS cp JOIN dbo.Categories AS c ON c.IDCategory = cp.IDCategory WHERE cp.IDCoupon = @IDCoupon
    UNION ALL
    SELECT ch.IDCategory FROM dbo.Categories AS ch JOIN Tree AS t ON ch.IDParentCategory = t.IDCategory
  ),
  Coupon AS (
    -- Value * 100 es exacto con DECIMAL(18,2): centavos para un monto fijo y puntos básicos (12,50 % -> 1250) para un porcentaje
    SELECT IDCoupon, Type, ValueUnits = CAST(Value * 100 AS BIGINT), IDCategory FROM dbo.Coupons WHERE IDCoupon = @IDCoupon
  ),
  Lines AS (
    SELECT ci.IDCartItem, ci.IDVariant,
           LineCents = CAST(v.Price * 100 AS BIGINT) * ci.Quantity,
           IsEligible = CASE WHEN cp.IDCategory IS NULL OR p.IDCategory IN (SELECT IDCategory FROM Tree) THEN 1 ELSE 0 END
    FROM dbo.CartItems AS ci
    JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
    JOIN dbo.Products AS p ON p.IDProduct = v.IDProduct
    CROSS JOIN Coupon AS cp
    WHERE ci.IDCart = @IDCart
  ),
  Weighted AS (
    SELECT IDCartItem, IDVariant, LineCents, Weight = CASE WHEN IsEligible = 1 THEN LineCents ELSE 0 END FROM Lines
  ),
  Totals AS (
    SELECT EligibleCents = SUM(Weight) FROM Weighted
  ),
  Discount AS (
    -- Porcentaje: una sola división half-even sobre el total elegible (ADR-0019). Monto fijo: nunca más que lo elegible.
    SELECT TotalDiscountCents = CASE WHEN cp.Type = N'Percentage' THEN h.Result
                                     WHEN cp.ValueUnits < t.EligibleCents THEN cp.ValueUnits
                                     ELSE t.EligibleCents END,
           t.EligibleCents
    FROM Coupon AS cp
    CROSS JOIN Totals AS t
    OUTER APPLY dbo.FU_Money_HalfEvenDivision(t.EligibleCents * cp.ValueUnits, 10000) AS h
  ),
  Base AS (
    -- El producto no desborda BIGINT: con totales por debajo de Q10,000,000 es menor que 1e18
    SELECT w.IDCartItem, w.IDVariant, w.LineCents, w.Weight, d.TotalDiscountCents, d.EligibleCents,
           Prod = d.TotalDiscountCents * w.Weight
    FROM Weighted AS w CROSS JOIN Discount AS d
  ),
  Floors AS (
    SELECT *,
           FloorCents = CASE WHEN EligibleCents > 0 THEN Prod / EligibleCents ELSE 0 END,
           Remainder = CASE WHEN EligibleCents > 0 THEN Prod % EligibleCents ELSE 0 END
    FROM Base
  ),
  Ranked AS (
    SELECT *,
           Missing = TotalDiscountCents - SUM(FloorCents) OVER (),
           -- Desempate determinista por línea: el mismo carrito siempre reparte igual
           Position = ROW_NUMBER() OVER (ORDER BY Remainder DESC, IDCartItem ASC)
    FROM Floors
  )
  -- Los centavos que faltan van a las líneas con mayor resto. Una línea no elegible tiene resto 0 y nunca llega a recibirlos:
  -- la suma de los restos es Missing * EligibleCents y cada resto es menor que EligibleCents, así que hay más líneas con
  -- resto positivo que centavos por repartir. La suma por línea es exactamente TotalDiscountCents.
  SELECT IDCartItem, IDVariant, LineCents,
         DiscountCents = FloorCents + CASE WHEN Position <= Missing THEN 1 ELSE 0 END,
         TotalDiscountCents, EligibleCents
  FROM Ranked;
GO
