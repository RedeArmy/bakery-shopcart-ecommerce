/* =====================================================================
   Objeto   : dbo.SP_Inventory_ReleaseExpiredReservations
   Version  : 1.2.0
   Cambio   : 1.2.0: las variantes de un producto comparten una existencia medida en unidades (V0019); las cantidades de las líneas son paquetes
              Antes: Devuelve también el conteo por parámetro de salida (@Released) para que el procedimiento del job no tenga que capturar el conjunto de resultados
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Compatible: sigue devolviendo una fila con ReleasedReservations; el parámetro de salida es opcional. Lo llama el job
              de expiración cada 60 segundos (SP_Jobs_ExpirePayments).
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Inventory_ReleaseExpiredReservations
  @Now      DATETIME2(3) = NULL,
  @Released INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- Mismo orden de bloqueo que ReserveStock (ver allí): ascendente por IDVariant. Se bloquean las variantes de las
  -- candidatas antes de reclamarlas; si otra sesión cambia alguna entretanto, bloquear de más no hace daño.
  DECLARE @ToLock TABLE (IDVariant INT PRIMARY KEY);
  INSERT INTO @ToLock (IDVariant)
  SELECT DISTINCT sv.IDStockHolder
  FROM dbo.Reservations AS r
  JOIN dbo.ReservationLines AS rl ON rl.IDReservation = r.IDReservation
  JOIN dbo.Variants AS sv ON sv.IDVariant = rl.IDVariant
  WHERE r.Status = N'Active' AND r.IDOrder IS NULL AND r.ExpiresAt <= @Now;
  DECLARE @IDVariant INT = 0, @Locked INT;
  WHILE 1 = 1
  BEGIN
    SELECT TOP (1) @IDVariant = IDVariant FROM @ToLock WHERE IDVariant > @IDVariant ORDER BY IDVariant;
    IF @@ROWCOUNT = 0 BREAK;
    SELECT @Locked = IDVariant FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant;
  END;

  -- Solo las reservas sin pedido: cuando hay pedido, la ventana la gobierna el vencimiento del pago
  -- (SP_Payments_ExpirePending). Se reclaman con un único UPDATE para que dos ejecuciones simultáneas
  -- del job nunca devuelvan las mismas unidades dos veces.
  DECLARE @Expired TABLE (IDReservation INT PRIMARY KEY);

  UPDATE dbo.Reservations
  SET Status = N'Expired'
  OUTPUT inserted.IDReservation INTO @Expired
  WHERE Status = N'Active' AND IDOrder IS NULL AND ExpiresAt <= @Now;

  UPDATE v
  SET ReservedStock = v.ReservedStock - l.Units
  FROM dbo.Variants AS v WITH (UPDLOCK, ROWLOCK)
  JOIN (
    SELECT sv.IDStockHolder, Units = SUM(rl.Quantity * sv.UnitsPerPack)
    FROM dbo.ReservationLines AS rl
    JOIN @Expired AS e ON e.IDReservation = rl.IDReservation
    JOIN dbo.Variants AS sv ON sv.IDVariant = rl.IDVariant
    GROUP BY sv.IDStockHolder
  ) AS l ON l.IDStockHolder = v.IDVariant;

  SET @Released = (SELECT COUNT(*) FROM @Expired);
  SELECT ReleasedReservations = @Released;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
