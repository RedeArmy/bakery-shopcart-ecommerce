/* =====================================================================
   Objeto   : dbo.FU_Dashboard_SalesByPeriod
   Version  : 1.0.0
   Cambio   : Primera versión: ventas por día, semana o mes, con los periodos sin ventas en cero
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un renglón por periodo del rango, en centavos enteros: pedidos, venta bruta, devuelto, venta neta y ticket
              promedio (neto entre pedidos, half-even una sola vez, ADR-0019). Agrupa por PaidAt en hora de Guatemala
              (ADR-0009). Devuelve como máximo 400 periodos; SP_Dashboard_SalesByPeriod rechaza los rangos que no caben. No
              garantiza orden: lo pone quien la llama.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Dashboard_SalesByPeriod (@From DATE, @To DATE, @Granularity VARCHAR(5))
RETURNS TABLE
AS
RETURN
  WITH Span AS (
    SELECT FirstPeriod = f.PeriodStart, LastPeriod = l.PeriodStart
    FROM dbo.FU_Dashboard_PeriodStart(@From, @Granularity) AS f
    CROSS JOIN dbo.FU_Dashboard_PeriodStart(@To, @Granularity) AS l
  ),
  -- Cuatrocientos números bastan para el tope de periodos; sys.all_objects se cruza consigo misma para tener de sobra
  Numbers AS (
    SELECT TOP (400) n = ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1
    FROM sys.all_objects AS a CROSS JOIN sys.all_objects AS b
  ),
  Periods AS (
    SELECT PeriodStart = CASE @Granularity
                           WHEN 'day'  THEN DATEADD(DAY, n.n, s.FirstPeriod)
                           WHEN 'week' THEN DATEADD(WEEK, n.n, s.FirstPeriod)
                           ELSE DATEADD(MONTH, n.n, s.FirstPeriod)
                         END,
           s.LastPeriod
    FROM Numbers AS n CROSS JOIN Span AS s
  ),
  Sold AS (
    SELECT Bucket = b.PeriodStart, o.IDOrder, o.TotalCents, o.ReturnedCents, o.NetCents
    FROM dbo.FU_Dashboard_Range(@From, @To, NULL) AS r
    JOIN dbo.VW_Dashboard_SoldOrders AS o ON o.PaidAt >= r.FromUtc AND o.PaidAt < r.ToUtc
    CROSS APPLY (SELECT LocalDate = CAST(((o.PaidAt AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') AS DATE)) AS d
    CROSS APPLY dbo.FU_Dashboard_PeriodStart(d.LocalDate, @Granularity) AS b
  ),
  Totals AS (
    SELECT p.PeriodStart,
           Orders        = COUNT(s.IDOrder),
           GrossCents    = ISNULL(SUM(s.TotalCents), 0),
           ReturnedCents = ISNULL(SUM(s.ReturnedCents), 0),
           NetCents      = ISNULL(SUM(s.NetCents), 0)
    FROM Periods AS p
    LEFT JOIN Sold AS s ON s.Bucket = p.PeriodStart
    WHERE p.PeriodStart <= p.LastPeriod
    GROUP BY p.PeriodStart
  )
  SELECT t.PeriodStart, t.Orders, t.GrossCents, t.ReturnedCents, t.NetCents,
         AverageTicketCents = CASE WHEN t.Orders > 0 THEN a.Result ELSE 0 END
  FROM Totals AS t
  OUTER APPLY dbo.FU_Money_HalfEvenDivision(t.NetCents, CASE WHEN t.Orders > 0 THEN t.Orders ELSE 1 END) AS a;
GO
