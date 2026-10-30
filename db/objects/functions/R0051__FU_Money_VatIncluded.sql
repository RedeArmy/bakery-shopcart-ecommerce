/* =====================================================================
   Objeto   : dbo.FU_Money_VatIncluded
   Version  : 1.0.0
   Cambio   : Primera versión: separa el IVA incluido en un total, sin perder ni crear centavos
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva; depende de dbo.FU_Money_HalfEvenDivision (R0050)
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Money_VatIncluded (@TotalCents BIGINT, @VatRate INT)
RETURNS TABLE
AS
RETURN
  -- Los precios ya incluyen IVA (ADR-0008): el impuesto es la fracción Tasa / (100 + Tasa) del total, es decir 12/112.
  -- La base se obtiene por resta y no por una segunda división, así que Base + IVA = Total siempre.
  -- Con @VatRate fuera de 0..100 o un total negativo el resultado es NULL (ver FU_Money_HalfEvenDivision).
  SELECT VatCents  = v.Result,
         BaseCents = @TotalCents - v.Result
  FROM dbo.FU_Money_HalfEvenDivision(
         CASE WHEN @VatRate BETWEEN 0 AND 100 THEN @TotalCents * @VatRate END,
         100 + @VatRate) AS v;
GO
