/* =====================================================================
   Objeto   : dbo.VW_Dashboard_SoldLines
   Version  : 1.0.0
   Cambio   : Primera versión: un renglón por línea de los pedidos que cuentan como venta, con lo devuelto descontado
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Base de las ventas por categoría y de los más vendidos (el catálogo del diseño las llamaba
              VW_Dashboard_SalesByCategory y VW_Dashboard_TopTenProducts, pero un renglón por línea con PaidAt permite filtrar
              por periodo y agrupar a quien las use). Mismo criterio de venta que VW_Dashboard_SoldOrders. La categoría es la
              congelada en la línea, así que un producto movido de categoría no reescribe el pasado. Importes en centavos.
   ===================================================================== */
CREATE OR ALTER VIEW dbo.VW_Dashboard_SoldLines
AS
  SELECT o.IDOrder, o.PaidAt, l.IDOrderLine, l.IDVariant, v.IDProduct, l.IDCategory,
         l.Quantity, l.ReturnedQuantity,
         LineCents     = CAST(l.LineTotal * 100 AS BIGINT),
         ReturnedCents = CAST(ISNULL(rl.Amount, 0) * 100 AS BIGINT),
         NetCents      = CAST((l.LineTotal - ISNULL(rl.Amount, 0)) * 100 AS BIGINT)
  FROM dbo.Orders AS o
  JOIN dbo.OrderLines AS l ON l.IDOrder = o.IDOrder
  JOIN dbo.Variants AS v ON v.IDVariant = l.IDVariant
  OUTER APPLY (SELECT Amount = SUM(RefundAmount) FROM dbo.ReturnLines WHERE IDOrderLine = l.IDOrderLine) AS rl
  WHERE o.PaidAt IS NOT NULL AND o.IDOrderStatus <> 6;
GO
