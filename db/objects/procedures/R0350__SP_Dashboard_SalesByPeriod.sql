/* =====================================================================
   Objeto   : dbo.SP_Dashboard_SalesByPeriod
   Version  : 1.0.0
   Cambio   : Primera versión: serie de ventas por día, semana o mes para la gráfica del panel
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un renglón por periodo, del más antiguo al más reciente, con los periodos sin ventas en cero. Cuenta los
              pedidos pagados y no cancelados, agrupados por la fecha de pago en hora de Guatemala, y descuenta lo devuelto
              (ADR-0009). Sin fechas, los últimos 30 días. Importes como texto con dos decimales. Errores: 50400 granularidad o
              rango inválidos, o más de 400 periodos.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Dashboard_SalesByPeriod
  @From        DATE         = NULL,
  @To          DATE         = NULL,
  @Granularity VARCHAR(5)   = 'day',
  @Now         DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @Granularity IS NULL OR @Granularity NOT IN ('day', 'week', 'month')
    THROW 50400, 'Granularity must be day, week or month.', 1;

  SELECT @From = FromDate, @To = ToDate FROM dbo.FU_Dashboard_Range(@From, @To, @Now);
  IF @From > @To
    THROW 50400, 'From must not be after To.', 1;

  -- Un tope de periodos evita gráficas ilegibles y consultas enormes por error
  DECLARE @Periods INT = (
    SELECT CASE @Granularity
             WHEN 'day'   THEN DATEDIFF(DAY, f.PeriodStart, l.PeriodStart) + 1
             WHEN 'week'  THEN DATEDIFF(DAY, f.PeriodStart, l.PeriodStart) / 7 + 1
             ELSE DATEDIFF(MONTH, f.PeriodStart, l.PeriodStart) + 1
           END
    FROM dbo.FU_Dashboard_PeriodStart(@From, @Granularity) AS f
    CROSS JOIN dbo.FU_Dashboard_PeriodStart(@To, @Granularity) AS l);
  IF @Periods > 400
    THROW 50400, 'The range has more than 400 periods; use a coarser granularity or a shorter range.', 1;

  SELECT s.PeriodStart, s.Orders,
         Gross         = g.Text,
         Returned      = r.Text,
         Net           = n.Text,
         AverageTicket = a.Text
  FROM dbo.FU_Dashboard_SalesByPeriod(@From, @To, @Granularity) AS s
  CROSS APPLY dbo.FU_Money_CentsToText(s.GrossCents) AS g
  CROSS APPLY dbo.FU_Money_CentsToText(s.ReturnedCents) AS r
  CROSS APPLY dbo.FU_Money_CentsToText(s.NetCents) AS n
  CROSS APPLY dbo.FU_Money_CentsToText(s.AverageTicketCents) AS a
  ORDER BY s.PeriodStart;
END;
GO
