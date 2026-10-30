/* =====================================================================
   Objeto   : dbo.SP_Jobs_PurgeExpired
   Version  : 1.0.0
   Cambio   : Primera versión: ejecución única de la purga diaria de llaves de idempotencia vencidas
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @Outcome es Ran o Skipped. Las purgas de DdlHistory y ReceivedWebhooks (D-08) se añadirán aquí cuando
              tengan procedimiento propio.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Jobs_PurgeExpired
  @Now                 DATETIME2(3) = NULL,
  @Outcome             VARCHAR(10)  = NULL OUTPUT,
  @PurgedIdempotency   INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SELECT @Outcome = 'Skipped', @PurgedIdempotency = 0;

  DECLARE @Lock INT;
  EXEC @Lock = sys.sp_getapplock @Resource = N'Job:PurgeExpired', @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0;
  IF @Lock < 0 RETURN;

  BEGIN TRY
    EXEC dbo.SP_Idempotency_PurgeExpired @Now = @Now, @Purged = @PurgedIdempotency OUTPUT;
    SET @Outcome = 'Ran';
  END TRY
  BEGIN CATCH
    EXEC sys.sp_releaseapplock @Resource = N'Job:PurgeExpired', @LockOwner = N'Session';
    THROW;
  END CATCH;

  EXEC sys.sp_releaseapplock @Resource = N'Job:PurgeExpired', @LockOwner = N'Session';
END;
GO
