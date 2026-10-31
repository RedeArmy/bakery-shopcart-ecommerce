/* =====================================================================
   Objeto   : dbo.SP_Jobs_PurgeExpired
   Version  : 1.1.0
   Cambio   : Además de las llaves de idempotencia, purga tokens de refresco, webhooks, carritos de visitante, reservas sin pedido e
              historial de DDL (SP_Retention_Purge), que antes crecían sin límite
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Compatible con 1.0.0: @Outcome y @PurgedIdempotency no cambian y las salidas nuevas son opcionales. @Outcome es Ran o
              Skipped. Cierra la deuda D-08.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Jobs_PurgeExpired
  @Now                 DATETIME2(3) = NULL,
  @Outcome             VARCHAR(10)  = NULL OUTPUT,
  @PurgedIdempotency   INT          = NULL OUTPUT,
  @PurgedRefreshTokens INT          = NULL OUTPUT,
  @PurgedWebhooks      INT          = NULL OUTPUT,
  @PurgedGuestCarts    INT          = NULL OUTPUT,
  @PurgedReservations  INT          = NULL OUTPUT,
  @PurgedDdlHistory    INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SELECT @Outcome = 'Skipped', @PurgedIdempotency = 0, @PurgedRefreshTokens = 0, @PurgedWebhooks = 0, @PurgedGuestCarts = 0,
         @PurgedReservations = 0, @PurgedDdlHistory = 0;

  DECLARE @Lock INT;
  EXEC @Lock = sys.sp_getapplock @Resource = N'Job:PurgeExpired', @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0;
  IF @Lock < 0 RETURN;

  BEGIN TRY
    EXEC dbo.SP_Idempotency_PurgeExpired @Now = @Now, @Purged = @PurgedIdempotency OUTPUT;
    EXEC dbo.SP_Retention_Purge @Now = @Now, @PurgedRefreshTokens = @PurgedRefreshTokens OUTPUT, @PurgedWebhooks = @PurgedWebhooks OUTPUT,
         @PurgedGuestCarts = @PurgedGuestCarts OUTPUT, @PurgedReservations = @PurgedReservations OUTPUT,
         @PurgedDdlHistory = @PurgedDdlHistory OUTPUT;
    SET @Outcome = 'Ran';
  END TRY
  BEGIN CATCH
    EXEC sys.sp_releaseapplock @Resource = N'Job:PurgeExpired', @LockOwner = N'Session';
    THROW;
  END CATCH;

  EXEC sys.sp_releaseapplock @Resource = N'Job:PurgeExpired', @LockOwner = N'Session';
END;
GO
