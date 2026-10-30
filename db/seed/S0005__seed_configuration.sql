/* =====================================================================
   Semilla : S0005 · Configuración de negocio
   Contenido : Diez parámetros con su valor por defecto
   Nota      : Idempotente (MERGE). Solo inserta las claves que faltan y nunca pisa un valor existente:
               estos parámetros se ajustan sin desplegar y una nueva ejecución de la semilla no debe
               deshacer ese ajuste. Un valor por defecto nuevo exige una migración o un procedimiento.
   ===================================================================== */
SET NOCOUNT ON;

MERGE dbo.Configuration AS target
USING (VALUES
  -- Minutos que se retiene el stock de un pago con tarjeta
  (N'ReservationMinutes', N'15'),
  -- Horas máximas de reserva para un depósito bancario (limitadas además por la fecha de entrega, ADR-0016)
  (N'DepositReservationHours', N'24'),
  -- Mínimo de horas útiles para ofrecer el depósito como método de pago
  (N'MinDepositHours', N'2'),
  -- Gracia tras rechazar un depósito antes de cancelar el pedido
  (N'RejectionGraceHours', N'12'),
  (N'MaxDepositAttempts', N'3'),
  (N'AbandonedCartHours', N'24'),
  -- Montos en quetzales como cadena decimal, sin coma flotante (ADR-0020)
  (N'ShippingCost', N'25.00'),
  (N'FreeShippingFrom', N'300.00'),
  -- Tasa de IVA como entero: se usa como fracción 12/112 porque los precios ya lo incluyen (ADR-0008)
  (N'VatRate', N'12'),
  (N'IdempotencyKeyHours', N'24')
) AS source (SettingKey, SettingValue)
ON target.SettingKey = source.SettingKey
WHEN NOT MATCHED BY TARGET THEN
  INSERT (SettingKey, SettingValue) VALUES (source.SettingKey, source.SettingValue);
