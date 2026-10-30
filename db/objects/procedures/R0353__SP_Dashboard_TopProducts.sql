/* =====================================================================
   Objeto   : dbo.SP_Dashboard_TopProducts
   Version  : 1.0.0
   Cambio   : Primera versión: los productos más vendidos en un rango de fechas, descontando devoluciones
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Se ordena por unidades vendidas menos devueltas y, en un empate, por venta neta y luego por producto, de modo
              que el resultado es siempre el mismo. Agrupa por producto y no por variante: dos tamaños del mismo pastel suman. Un
              producto con todas sus unidades devueltas no aparece. @Top va de 1 a 50 (10 por defecto). Importes como texto con
              dos decimales. Errores: 50400 rango o @Top inválidos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Dashboard_TopProducts
  @From DATE         = NULL,
  @To   DATE         = NULL,
  @Top  INT          = 10,
  @Now  DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @Top IS NULL OR @Top < 1 OR @Top > 50
    THROW 50400, 'Top must be between 1 and 50.', 1;
  SELECT @From = FromDate, @To = ToDate FROM dbo.FU_Dashboard_Range(@From, @To, @Now);
  IF @From > @To OR DATEDIFF(DAY, @From, @To) > 3660
    THROW 50400, 'From must not be after To and the range cannot exceed ten years.', 1;

  SELECT TOP (@Top)
         -- ROW_NUMBER es BIGINT y el controlador entrega los BIGINT como texto; son 50 posiciones como máximo, caben en INT
         Position = CAST(ROW_NUMBER() OVER (ORDER BY t.Units DESC, t.NetCents DESC, t.IDProduct) AS INT),
         t.IDProduct, ProductName = p.Name, t.Units, Net = n.Text
  FROM (
    SELECT l.IDProduct, Units = SUM(l.Quantity - l.ReturnedQuantity), NetCents = SUM(l.NetCents)
    FROM dbo.FU_Dashboard_Range(@From, @To, @Now) AS r
    JOIN dbo.VW_Dashboard_SoldLines AS l ON l.PaidAt >= r.FromUtc AND l.PaidAt < r.ToUtc
    GROUP BY l.IDProduct
    HAVING SUM(l.Quantity - l.ReturnedQuantity) > 0
  ) AS t
  JOIN dbo.Products AS p ON p.IDProduct = t.IDProduct
  CROSS APPLY dbo.FU_Money_CentsToText(t.NetCents) AS n
  ORDER BY t.Units DESC, t.NetCents DESC, t.IDProduct;
END;
GO
