/* =====================================================================
   Objeto   : dbo.SP_System_GetSchemaVersion
   Version  : 1.0.0
   Cambio   : Primera versión: devuelve el número de la última migración aplicada con éxito
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva; el backend la usa en /health/ready para no atender tráfico con un esquema atrasado
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_System_GetSchemaVersion
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  -- La aplicación no tiene SELECT sobre las tablas (ADR-0002): solo puede leer la versión por este procedimiento.
  -- Cuentan solo las migraciones V; los objetos y las semillas se versionan aparte. Las ejecuciones fallidas se ignoran
  -- porque el runner las deshace por completo. Sin ninguna migración aplicada el resultado es 0.
  SELECT SchemaVersion = ISNULL(MAX(Number), 0)
  FROM dbo.SchemaVersion
  WHERE Type = 'V' AND IsSuccessful = 1;
END;
GO
