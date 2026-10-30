/* =====================================================================
   Objeto   : dbo.SP_Inventory_ReleaseCartReservation
   Version  : 1.0.0
   Cambio   : Primera versión: libera la reserva activa de un carrito y devuelve sus unidades al stock disponible
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva; SP_Inventory_ReserveStock (R0111) la invoca antes de reservar de nuevo
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Inventory_ReleaseCartReservation
  @IDUser INT,
  @IDCart INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL OR @IDCart IS NULL
    THROW 50400, 'IDUser and IDCart are required.', 1;

  -- Si el llamador ya abrió una transacción (ReserveStock, una prueba), esta forma parte de ella y no hace COMMIT propio
  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- La propiedad se comprueba aquí dentro (anti-IDOR); el bloqueo serializa las solicitudes del mismo carrito
  IF NOT EXISTS (SELECT 1 FROM dbo.Carts WITH (UPDLOCK, ROWLOCK) WHERE IDCart = @IDCart AND IDUser = @IDUser)
    THROW 50404, 'Cart not found.', 1;

  -- Mismo orden de bloqueo que ReserveStock (ver allí): ascendente por IDVariant, para no formar ciclos entre procedimientos
  DECLARE @ToLock TABLE (IDVariant INT PRIMARY KEY);
  INSERT INTO @ToLock (IDVariant)
  SELECT rl.IDVariant
  FROM dbo.ReservationLines AS rl
  JOIN dbo.Reservations AS r ON r.IDReservation = rl.IDReservation
  WHERE r.IDCart = @IDCart AND r.IDOrder IS NULL AND r.Status = N'Active';
  DECLARE @IDVariant INT = 0, @Locked INT;
  WHILE 1 = 1
  BEGIN
    SELECT TOP (1) @IDVariant = IDVariant FROM @ToLock WHERE IDVariant > @IDVariant ORDER BY IDVariant;
    IF @@ROWCOUNT = 0 BREAK;
    SELECT @Locked = IDVariant FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant;
  END;

  -- Se reclama la reserva con un único UPDATE: si dos solicitudes compiten, la segunda reevalúa el estado y no encuentra
  -- nada, así que las unidades nunca se devuelven dos veces. Una reserva ligada a un pedido no se toca: la conserva el pedido.
  DECLARE @Released TABLE (IDReservation INT PRIMARY KEY);

  UPDATE dbo.Reservations
  SET Status = N'Released'
  OUTPUT inserted.IDReservation INTO @Released
  WHERE IDCart = @IDCart AND IDOrder IS NULL AND Status = N'Active';

  UPDATE v
  SET ReservedStock = v.ReservedStock - l.Quantity
  FROM dbo.Variants AS v WITH (UPDLOCK, ROWLOCK)
  JOIN (
    SELECT rl.IDVariant, Quantity = SUM(rl.Quantity)
    FROM dbo.ReservationLines AS rl
    JOIN @Released AS r ON r.IDReservation = rl.IDReservation
    GROUP BY rl.IDVariant
  ) AS l ON l.IDVariant = v.IDVariant;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
