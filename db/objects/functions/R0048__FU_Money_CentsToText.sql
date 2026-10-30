/* =====================================================================
   Objeto   : dbo.FU_Money_CentsToText
   Version  : 1.0.0
   Cambio   : Primera versión: centavos enteros a texto con dos decimales ("24591" -> "245.91")
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva; es la única conversión de centavos a texto que usan los procedimientos que devuelven importes
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Money_CentsToText (@Cents BIGINT)
RETURNS TABLE
AS
RETURN
  -- Los importes viajan como texto con exactamente dos decimales, nunca como número (ADR-0020). La división se hace en
  -- DECIMAL, que es exacta para dos decimales, y no en coma flotante: 24591 / 100 nunca se convierte en 245.90999...
  SELECT Text = CAST(CAST(CAST(@Cents AS DECIMAL(20,2)) / 100 AS DECIMAL(18,2)) AS VARCHAR(25));
GO
