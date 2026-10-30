/* =====================================================================
   Objeto   : dbo.SP_Jobs_ExpirePayments
   Version  : 1.0.0
   Cambio   : Primera versión: ejecución única del vencimiento de pagos y de reservas (job de 60 segundos)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @Outcome es Ran o Skipped (otra instancia ya lo está ejecutando); un fallo se lanza tal cual y libera el
              bloqueo. Las dos tareas son SP_Payments_ExpirePending y SP_Inventory_ReleaseExpiredReservations.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Jobs_ExpirePayments
  @Now                  DATETIME2(3) = NULL,
  @BatchSize            INT          = 100,
  @Outcome              VARCHAR(10)  = NULL OUTPUT,
  @ExpiredOrders        INT          = NULL OUTPUT,
  @ReleasedReservations INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SELECT @Outcome = 'Skipped', @ExpiredOrders = 0, @ReleasedReservations = 0;

  -- Bloqueo de SESIÓN y no de transacción: cada pedido se cancela en su propia transacción dentro de ExpirePending, y un
  -- bloqueo de transacción obligaría a envolver todo en una sola, de modo que un fallo deshiciera lo ya cancelado y las filas
  -- quedaran bloqueadas durante toda la ejecución. Esta llamada ocupa una sola conexión de principio a fin; si el proceso
  -- muere, la conexión se cierra y el bloqueo se libera solo. LockTimeout 0: quien no lo obtiene no espera, se salta la vuelta.
  DECLARE @Lock INT;
  EXEC @Lock = sys.sp_getapplock @Resource = N'Job:ExpirePayments', @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0;
  IF @Lock < 0 RETURN;

  BEGIN TRY
    EXEC dbo.SP_Payments_ExpirePending @Now = @Now, @BatchSize = @BatchSize, @Expired = @ExpiredOrders OUTPUT;
    EXEC dbo.SP_Inventory_ReleaseExpiredReservations @Now = @Now, @Released = @ReleasedReservations OUTPUT;
    SET @Outcome = 'Ran';
  END TRY
  BEGIN CATCH
    -- Un bloqueo de sesión no se libera solo al fallar el procedimiento: se suelta antes de relanzar el error
    EXEC sys.sp_releaseapplock @Resource = N'Job:ExpirePayments', @LockOwner = N'Session';
    THROW;
  END CATCH;

  EXEC sys.sp_releaseapplock @Resource = N'Job:ExpirePayments', @LockOwner = N'Session';
END;
GO
