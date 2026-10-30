/* =====================================================================
   Objeto   : dbo.FU_Catalogue_CurrentPrice
   Version  : 1.0.0
   Cambio   : Primera versión: precio vigente de una variante en centavos enteros y si se puede comprar
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Cero filas si la variante no existe.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Catalogue_CurrentPrice (@IDVariant INT)
RETURNS TABLE
AS
RETURN
  -- El precio incluye IVA (ADR-0008). DECIMAL(18,2) * 100 es exacto: nunca pasa por coma flotante.
  -- Una variante se puede comprar solo si ella y su producto están activos.
  SELECT v.IDVariant,
         PriceCents = CAST(v.Price * 100 AS BIGINT),
         IsAvailable = CAST(CASE WHEN v.IsActive = 1 AND p.IsActive = 1 THEN 1 ELSE 0 END AS BIT)
  FROM dbo.Variants AS v
  JOIN dbo.Products AS p ON p.IDProduct = v.IDProduct
  WHERE v.IDVariant = @IDVariant;
GO
