/* =====================================================================
   Objeto   : dbo.VW_Reconciliation_Amounts
   Version  : 1.0.0
   Cambio   : Primera versión: los controles de dinero de money-handling.md en una sola vista
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Debe devolver CERO filas; cada fila es una discrepancia con su control en Check, la entidad en EntityKey y los
              dos importes que no coinciden. El inventario tiene su propia vista (VW_Inventory_Reconciliation).
   ===================================================================== */
CREATE OR ALTER VIEW dbo.VW_Reconciliation_Amounts
AS
  -- 1. El subtotal del pedido es la suma de precio por cantidad de sus líneas
  SELECT [Check] = CAST(N'OrderSubtotal' AS NVARCHAR(30)), EntityKey = CAST(o.IDOrder AS NVARCHAR(40)),
         Expected = CAST(ISNULL(l.Subtotal, 0) AS DECIMAL(18,2)), Actual = o.Subtotal
  FROM dbo.Orders AS o
  LEFT JOIN (SELECT IDOrder, Subtotal = SUM(UnitPrice * Quantity) FROM dbo.OrderLines GROUP BY IDOrder) AS l ON l.IDOrder = o.IDOrder
  WHERE o.Subtotal <> ISNULL(l.Subtotal, 0)

  UNION ALL

  -- 2. El descuento del pedido es la suma de los descuentos de sus líneas
  SELECT N'OrderDiscount', CAST(o.IDOrder AS NVARCHAR(40)), CAST(ISNULL(l.Discount, 0) AS DECIMAL(18,2)), o.Discount
  FROM dbo.Orders AS o
  LEFT JOIN (SELECT IDOrder, Discount = SUM(LineDiscount) FROM dbo.OrderLines GROUP BY IDOrder) AS l ON l.IDOrder = o.IDOrder
  WHERE o.Discount <> ISNULL(l.Discount, 0)

  UNION ALL

  -- 3. El pago aprobado (o ya reembolsado) cobró exactamente el total del pedido
  SELECT N'PaymentVsOrderTotal', CAST(p.IDPayment AS NVARCHAR(40)), o.Total, p.Amount
  FROM dbo.Payments AS p
  JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
  WHERE p.IDPaymentStatus IN (3, 7) AND p.Amount <> o.Total

  UNION ALL

  -- 4. El libro registra un cobro por cada pago aprobado o reembolsado y por el importe exacto
  SELECT N'ChargeVsPayment', CAST(p.IDPayment AS NVARCHAR(40)), p.Amount, CAST(ISNULL(c.Charged, 0) AS DECIMAL(18,2))
  FROM dbo.Payments AS p
  LEFT JOIN (SELECT IDPayment, Charged = SUM(Amount) FROM dbo.FinancialMovements WHERE Type = N'Charge' GROUP BY IDPayment) AS c
    ON c.IDPayment = p.IDPayment
  WHERE p.IDPaymentStatus IN (3, 7) AND p.Amount <> ISNULL(c.Charged, 0)

  UNION ALL

  -- 5. Lo reembolsado o por reembolsar de un pago nunca supera lo cobrado
  SELECT N'RefundsExceedPayment', CAST(p.IDPayment AS NVARCHAR(40)), p.Amount, r.Total
  FROM dbo.Payments AS p
  JOIN (SELECT IDPayment, Total = SUM(Amount) FROM dbo.Refunds WHERE Status IN (N'Pending', N'Processed') GROUP BY IDPayment) AS r
    ON r.IDPayment = p.IDPayment
  WHERE r.Total > p.Amount

  UNION ALL

  -- 6. Los reembolsos del libro (con signo negativo) son exactamente los reembolsos procesados
  SELECT N'RefundLedger', CAST(r.IDRefund AS NVARCHAR(40)), r.Amount, CAST(-ISNULL(f.Ledger, 0) AS DECIMAL(18,2))
  FROM dbo.Refunds AS r
  LEFT JOIN (SELECT IDRefund, Ledger = SUM(Amount) FROM dbo.FinancialMovements WHERE Type = N'Refund' GROUP BY IDRefund) AS f
    ON f.IDRefund = r.IDRefund
  WHERE (r.Status = N'Processed' AND r.Amount <> -ISNULL(f.Ledger, 0))
     OR (r.Status <> N'Processed' AND f.Ledger IS NOT NULL)

  UNION ALL

  -- 7. El reembolso de una devolución es la suma de los reembolsos de sus líneas
  SELECT N'ReturnTotal', CAST(r.IDReturn AS NVARCHAR(40)), r.RefundAmount, CAST(ISNULL(l.Total, 0) AS DECIMAL(18,2))
  FROM dbo.Returns AS r
  LEFT JOIN (SELECT IDReturn, Total = SUM(RefundAmount) FROM dbo.ReturnLines GROUP BY IDReturn) AS l ON l.IDReturn = r.IDReturn
  WHERE r.RefundAmount <> ISNULL(l.Total, 0)

  UNION ALL

  -- 8. Las unidades devueltas de cada línea son la suma de sus líneas de devolución
  SELECT N'ReturnedQuantity', CAST(ol.IDOrderLine AS NVARCHAR(40)), CAST(ISNULL(rl.Quantity, 0) AS DECIMAL(18,2)), CAST(ol.ReturnedQuantity AS DECIMAL(18,2))
  FROM dbo.OrderLines AS ol
  LEFT JOIN (SELECT IDOrderLine, Quantity = SUM(Quantity) FROM dbo.ReturnLines GROUP BY IDOrderLine) AS rl ON rl.IDOrderLine = ol.IDOrderLine
  WHERE ol.ReturnedQuantity <> ISNULL(rl.Quantity, 0)

  UNION ALL

  -- 9. Una línea devuelta por completo reembolsó exactamente su total, sin perder ni sobrar centavos
  SELECT N'FullReturnExact', CAST(ol.IDOrderLine AS NVARCHAR(40)), ol.LineTotal, CAST(rl.Total AS DECIMAL(18,2))
  FROM dbo.OrderLines AS ol
  JOIN (SELECT IDOrderLine, Total = SUM(RefundAmount) FROM dbo.ReturnLines GROUP BY IDOrderLine) AS rl ON rl.IDOrderLine = ol.IDOrderLine
  WHERE ol.ReturnedQuantity = ol.Quantity AND rl.Total <> ol.LineTotal

  UNION ALL

  -- 10. Las comisiones del libro (con signo negativo) son las comisiones registradas en los pagos
  SELECT N'FeeLedger', CAST(p.IDPayment AS NVARCHAR(40)), ISNULL(p.ProviderFee, 0), CAST(-ISNULL(f.Ledger, 0) AS DECIMAL(18,2))
  FROM dbo.Payments AS p
  LEFT JOIN (SELECT IDPayment, Ledger = SUM(Amount) FROM dbo.FinancialMovements WHERE Type = N'Fee' GROUP BY IDPayment) AS f
    ON f.IDPayment = p.IDPayment
  WHERE p.IDPaymentStatus IN (3, 7) AND ISNULL(p.ProviderFee, 0) <> -ISNULL(f.Ledger, 0)

  UNION ALL

  -- 11. El contador de usos de un cupón son sus usos no anulados
  SELECT N'CouponUsage', CAST(c.IDCoupon AS NVARCHAR(40)), CAST(ISNULL(u.Used, 0) AS DECIMAL(18,2)), CAST(c.UsageCount AS DECIMAL(18,2))
  FROM dbo.Coupons AS c
  LEFT JOIN (SELECT IDCoupon, Used = COUNT(*) FROM dbo.CouponUsages WHERE IsVoided = 0 GROUP BY IDCoupon) AS u ON u.IDCoupon = c.IDCoupon
  WHERE c.UsageCount <> ISNULL(u.Used, 0);
GO
