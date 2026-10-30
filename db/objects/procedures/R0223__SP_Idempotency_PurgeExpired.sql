/* =====================================================================
   Objeto   : dbo.SP_Idempotency_PurgeExpired
   Version  : 1.0.0
   Cambio   : Primera versión: borra las llaves vencidas por lotes (la ejecutará el job diario)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @Purged devuelve cuántas filas borró. Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Idempotency_PurgeExpired
  @Now       DATETIME2(3) = NULL,
  @BatchSize INT          = 1000,
  -- Tope de lotes por ejecución: si hay un atraso enorme, el job termina y la siguiente ejecución sigue
  @MaxBatches INT         = 100,
  @Purged    INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @BatchSize < 1 OR @BatchSize > 10000 OR @MaxBatches < 1
    THROW 50400, 'BatchSize must be between 1 and 10000 and MaxBatches at least 1.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @Purged = 0;

  DECLARE @Deleted INT = 1, @Batches INT = 0;

  -- Por lotes y no con un solo DELETE: un borrado enorme bloquearía la tabla que cada solicitud consulta al empezar. Cada
  -- lote es su propia transacción, así que entre uno y otro las solicitudes pasan. Se borra también lo que quedó en proceso:
  -- a las 24 horas de vida una solicitud está abandonada sin duda.
  WHILE @Deleted > 0 AND @Batches < @MaxBatches
  BEGIN
    DELETE TOP (@BatchSize) FROM dbo.IdempotentRequests WHERE ExpiresAt <= @Now;
    SET @Deleted = @@ROWCOUNT;
    SET @Purged += @Deleted;
    SET @Batches += 1;
  END;
END;
GO
