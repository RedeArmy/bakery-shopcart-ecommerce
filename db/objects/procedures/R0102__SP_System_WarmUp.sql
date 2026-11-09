/* =====================================================================
   Objeto   : dbo.SP_System_WarmUp
   Version  : 1.0.0
   Cambio   : Primera versión: hace la primera conversión de zona horaria de la instancia antes de que la pida un cliente
   Autor    : Equipo ShopCart   Fecha: 2026-11-09
   Compat   : Nueva. El backend la llama una vez al arrancar. No lee ni escribe tablas.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_System_WarmUp
AS
BEGIN
  SET NOCOUNT ON;

  -- La primera conversión AT TIME ZONE de una instancia de SQL Server carga la base de zonas horarias y tarda varios segundos
  -- (unos 5 s medidos en el contenedor); las siguientes son inmediatas. La fecha de entrega, el plazo del depósito y los
  -- reportes la usan, así que sin este arranque en caliente la paga el primer cliente que llega al pago.
  SELECT LocalToday = CAST(((SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') AS DATE);
END;
GO
