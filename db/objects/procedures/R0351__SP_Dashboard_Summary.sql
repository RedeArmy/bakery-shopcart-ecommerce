/* =====================================================================
   Objeto   : dbo.SP_Dashboard_Summary
   Version  : 1.1.0
   Cambio   : Los carritos abandonados se cuentan con un predicado sargable y sin calcular su valor; antes se valoraban todos solo para contarlos
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Mismas columnas que 1.0.0. Una sola fila. Las ventas siguen la definición de ADR-0009 (pagados y no cancelados, por fecha de pago, menos
              devoluciones); el ticket promedio es la venta neta entre los pedidos pagados, con redondeo half-even. Los tres
              contadores finales son del momento actual y no dependen del rango: pedidos esperando pago, depósitos en revisión y
              carritos abandonados. Importes como texto con dos decimales. Errores: 50400 rango inválido.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Dashboard_Summary
  @From DATE         = NULL,
  @To   DATE         = NULL,
  @Now  DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SELECT @From = FromDate, @To = ToDate FROM dbo.FU_Dashboard_Range(@From, @To, @Now);
  IF @From > @To OR DATEDIFF(DAY, @From, @To) > 3660
    THROW 50400, 'From must not be after To and the range cannot exceed ten years.', 1;

  DECLARE @Orders INT, @GrossCents BIGINT, @ReturnedCents BIGINT, @NetCents BIGINT;
  SELECT @Orders = COUNT(o.IDOrder), @GrossCents = ISNULL(SUM(o.TotalCents), 0),
         @ReturnedCents = ISNULL(SUM(o.ReturnedCents), 0), @NetCents = ISNULL(SUM(o.NetCents), 0)
  FROM dbo.FU_Dashboard_Range(@From, @To, @Now) AS r
  JOIN dbo.VW_Dashboard_SoldOrders AS o ON o.PaidAt >= r.FromUtc AND o.PaidAt < r.ToUtc;

  -- Contar no necesita el valor del carrito, solo saber que tiene productos
  DECLARE @Abandoned INT;
  SELECT @Abandoned = COUNT(*)
  FROM dbo.Carts AS c
  WHERE c.Status = N'Active' AND c.LastActivityAt <= (SELECT CutoffAt FROM dbo.FU_Carts_AbandonmentCutoff(@Now))
    AND EXISTS (SELECT 1 FROM dbo.CartItems AS ci WHERE ci.IDCart = c.IDCart)
  OPTION (RECOMPILE);

  SELECT FromDate = @From, ToDate = @To, Orders = @Orders,
         Gross = g.Text, Returned = rt.Text, Net = n.Text,
         AverageTicket = a.Text,
         PendingPaymentOrders = (SELECT COUNT(*) FROM dbo.Orders WHERE IDOrderStatus = 1),
         DepositsUnderReview  = (SELECT COUNT(*) FROM dbo.Payments WHERE IDPaymentMethod = 2 AND IDPaymentStatus = 2),
         AbandonedCarts       = @Abandoned
  FROM (SELECT One = 1) AS x
  CROSS APPLY dbo.FU_Money_CentsToText(@GrossCents) AS g
  CROSS APPLY dbo.FU_Money_CentsToText(@ReturnedCents) AS rt
  CROSS APPLY dbo.FU_Money_CentsToText(@NetCents) AS n
  CROSS APPLY dbo.FU_Money_HalfEvenDivision(@NetCents, CASE WHEN @Orders > 0 THEN @Orders ELSE 1 END) AS d
  CROSS APPLY dbo.FU_Money_CentsToText(CASE WHEN @Orders > 0 THEN d.Result ELSE 0 END) AS a;
END;
GO
