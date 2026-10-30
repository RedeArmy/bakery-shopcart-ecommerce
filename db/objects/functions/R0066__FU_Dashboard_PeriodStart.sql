/* =====================================================================
   Objeto   : dbo.FU_Dashboard_PeriodStart
   Version  : 1.0.0
   Cambio   : Primera versión: primer día del día, la semana o el mes al que pertenece una fecha
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. La semana empieza el lunes. No depende de DATEFIRST: el 1 de enero de 1900 fue lunes y se cuentan los días
              desde ahí. Una granularidad que no sea day, week o month devuelve NULL.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Dashboard_PeriodStart (@Date DATE, @Granularity VARCHAR(5))
RETURNS TABLE
AS
RETURN
  SELECT PeriodStart = CASE @Granularity
                         WHEN 'day'   THEN @Date
                         WHEN 'week'  THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', @Date) % 7), @Date)
                         WHEN 'month' THEN DATEFROMPARTS(YEAR(@Date), MONTH(@Date), 1)
                       END;
GO
