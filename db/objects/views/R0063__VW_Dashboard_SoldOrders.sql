/* =====================================================================
   Objeto   : dbo.VW_Dashboard_SoldOrders
   Version  : 1.0.0
   Cambio   : Primera versión: un renglón por pedido que cuenta como venta, con lo devuelto descontado
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Es la base de los reportes (ADR-0009): un pedido es venta si tiene PaidAt y no está cancelado; los
              pendientes de pago nunca cuentan. Los importes van en centavos enteros. Un pedido devuelto por completo sigue
              siendo venta con neto cero.
   ===================================================================== */
CREATE OR ALTER VIEW dbo.VW_Dashboard_SoldOrders
AS
  SELECT o.IDOrder, o.PaidAt,
         TotalCents    = CAST(o.Total * 100 AS BIGINT),
         ReturnedCents = CAST(ISNULL(r.Amount, 0) * 100 AS BIGINT),
         NetCents      = CAST((o.Total - ISNULL(r.Amount, 0)) * 100 AS BIGINT)
  FROM dbo.Orders AS o
  OUTER APPLY (SELECT Amount = SUM(RefundAmount) FROM dbo.Returns WHERE IDOrder = o.IDOrder) AS r
  WHERE o.PaidAt IS NOT NULL AND o.IDOrderStatus <> 6;
GO
