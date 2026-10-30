/* =====================================================================
   Objeto   : dbo.FU_Payments_DepositWindow
   Version  : 1.0.0
   Cambio   : Primera versión: fecha límite para pagar con depósito y minutos que quedan (ADR-0016)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila siempre. MinutesAvailable puede ser negativo si la fecha de entrega ya no deja tiempo.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Payments_DepositWindow (@DeliveryDate DATE, @LeadTimeDays INT, @Now DATETIME2(3))
RETURNS TABLE
AS
RETURN
  -- El depósito no retiene existencias 24 horas para un pastel que se necesita mañana: la fecha límite es la menor entre
  -- las horas configuradas y la entrega menos la anticipación del producto. La entrega se interpreta a las 00:00 de Guatemala
  -- y se pasa a UTC, que es como se guardan todas las fechas.
  SELECT DeadlineAt = CASE WHEN t.DeliveryCap < t.MaxHold THEN t.DeliveryCap ELSE t.MaxHold END,
         MinutesAvailable = DATEDIFF(MINUTE, @Now, CASE WHEN t.DeliveryCap < t.MaxHold THEN t.DeliveryCap ELSE t.MaxHold END)
  FROM (
    SELECT MaxHold = DATEADD(HOUR, ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'DepositReservationHours'), 24), @Now),
           DeliveryCap = DATEADD(DAY, -@LeadTimeDays,
             CAST(((CAST(@DeliveryDate AS DATETIME2(3)) AT TIME ZONE 'Central America Standard Time') AT TIME ZONE 'UTC') AS DATETIME2(3)))
  ) AS t;
GO
