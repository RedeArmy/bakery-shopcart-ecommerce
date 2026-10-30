/* =====================================================================
   Objeto   : dbo.FU_Orders_RefundableAmount
   Version  : 1.0.0
   Cambio   : Primera versión: importe que se devuelve por N unidades de una línea, cerrando exacto en la última
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. RefundCents es NULL cuando la cantidad no es válida (menos de 1 o más de las pendientes de devolver):
              una función en línea no puede lanzar un error y el llamador lo convierte en RETURN_QUANTITY_EXCEEDED.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Orders_RefundableAmount (@IDOrderLine INT, @Quantity INT)
RETURNS TABLE
AS
RETURN
  -- Cada unidad vale LineTotal / Quantity redondeado half-even; la última unidad pendiente devuelve lo que falta del total de la
  -- línea y no su parte proporcional, así la suma de todas las devoluciones es exactamente LineTotal sin perder ni sobrar centavos.
  -- LineTotal tiene dos decimales, de modo que multiplicarlo por 100 es exacto.
  SELECT RefundCents = CASE
           WHEN @Quantity < 1 OR @Quantity > l.Quantity - l.ReturnedQuantity THEN CAST(NULL AS BIGINT)
           WHEN @Quantity = l.Quantity - l.ReturnedQuantity THEN CAST(l.LineTotal * 100 AS BIGINT) - prior.Cents
           ELSE share.Result
         END
  FROM dbo.OrderLines AS l
  OUTER APPLY (
    SELECT Cents = ISNULL(SUM(CAST(rl.RefundAmount * 100 AS BIGINT)), 0)
    FROM dbo.ReturnLines AS rl WHERE rl.IDOrderLine = l.IDOrderLine
  ) AS prior
  CROSS APPLY dbo.FU_Money_HalfEvenDivision(CAST(l.LineTotal * 100 AS BIGINT) * ISNULL(@Quantity, 0), l.Quantity) AS share
  WHERE l.IDOrderLine = @IDOrderLine;
GO
