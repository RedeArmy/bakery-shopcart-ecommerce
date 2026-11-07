/* =====================================================================
   Objeto   : dbo.FU_Checkout_EstimatedDeliveryDate
   Version  : 1.0.0
   Cambio   : Primera versión: la fecha de entrega o recogida que define el sistema, y que el cliente ya no elige
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. Una fila, o ninguna si no hay una fecha cercana que deje tiempo para pagar (quien llama usa entonces la
              primera fecha que permite la anticipación del producto).
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Checkout_EstimatedDeliveryDate (@LeadTimeDays INT, @Now DATETIME2(3))
RETURNS TABLE
AS
RETURN
  -- Es la primera fecha que respeta la anticipación del producto más exigente Y deja tiempo para pagar por depósito
  -- (FU_Payments_DepositWindow). Es una estimación: el cliente no la elige y el negocio puede ajustarla unos días.
  SELECT TOP (1) EstimatedDate = c.Candidate
  FROM (SELECT LocalToday = CAST(((@Now AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') AS DATE)) AS t
  CROSS APPLY (VALUES (0), (1), (2), (3), (4), (5), (6), (7)) AS n (DaysAfter)
  CROSS APPLY (SELECT Candidate = DATEADD(DAY, @LeadTimeDays + n.DaysAfter, t.LocalToday)) AS c
  CROSS APPLY dbo.FU_Payments_DepositWindow(c.Candidate, @LeadTimeDays, @Now) AS w
  WHERE w.MinutesAvailable >= ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'MinDepositHours'), 2) * 60
  ORDER BY n.DaysAfter;
GO
