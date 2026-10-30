/* =====================================================================
   Objeto   : dbo.FU_Money_HalfEvenDivision
   Version  : 1.0.0
   Cambio   : Primera versión: única implementación SQL del redondeo half-even (ADR-0019)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva; backend/src/shared-kernel/rounding.ts es su equivalente en TypeScript y ambas comparten vectores de prueba
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Money_HalfEvenDivision (@N BIGINT, @D BIGINT)
RETURNS TABLE
AS
RETURN
  -- Dominio: @N >= 0 y @D > 0. Fuera de él el resultado es NULL y no un error, porque una función en línea no puede
  -- lanzarlo; el NULL hace fallar la columna NOT NULL que lo reciba en lugar de guardar un importe inventado.
  -- Se compara Remainder con @D - Remainder y no 2 * Remainder: así no hay desbordamiento con divisores cercanos al máximo de BIGINT.
  SELECT Result = q.Quotient
                + CASE WHEN q.Remainder > @D - q.Remainder THEN 1                 -- fracción > 0,5: sube
                       WHEN q.Remainder = @D - q.Remainder THEN q.Quotient % 2    -- empate exacto: sube solo si el cociente es impar (queda par)
                       ELSE 0 END                                                 -- fracción < 0,5: baja
  FROM (
    SELECT Quotient  = CASE WHEN @N >= 0 AND @D > 0 THEN @N / NULLIF(@D, 0) END,
           Remainder = CASE WHEN @N >= 0 AND @D > 0 THEN @N % NULLIF(@D, 0) END
  ) AS q;
GO
