/* =====================================================================
   Semilla : S0006 · Retención de datos
   Contenido : Cinco claves de Configuration con los días que se conservan las tablas que solo crecen
   Nota      : Idempotente (MERGE) y sin pisar un valor que el administrador ya cambió. Las usa SP_Retention_Purge.
   ===================================================================== */
SET NOCOUNT ON;

MERGE dbo.Configuration AS target
USING (VALUES
  -- Días tras el último vencimiento de una familia de tokens de refresco; después ya no sirve ni para detectar reutilización
  (N'RetentionRefreshTokenDays', N'30'),
  -- Webhooks de la pasarela recibidos: la deduplicación solo necesita los recientes
  (N'RetentionWebhookDays', N'90'),
  -- Carritos de visitante sin actividad (los de clientes con cuenta no se purgan)
  (N'RetentionGuestCartDays', N'30'),
  -- Reservas liberadas o vencidas que nunca llegaron a ser un pedido
  (N'RetentionReservationDays', N'90'),
  -- Historial de DDL: es evidencia de cambios de esquema, por eso se conserva más tiempo
  (N'RetentionDdlHistoryDays', N'365')
) AS source (SettingKey, SettingValue)
ON target.SettingKey = source.SettingKey
WHEN NOT MATCHED BY TARGET THEN
  INSERT (SettingKey, SettingValue) VALUES (source.SettingKey, source.SettingValue);
