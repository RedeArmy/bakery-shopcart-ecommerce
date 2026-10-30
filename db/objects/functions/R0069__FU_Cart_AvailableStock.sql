/* =====================================================================
   Objeto   : dbo.FU_Cart_AvailableStock
   Version  : 1.0.0
   Cambio   : Primera versión: unidades que un carrito puede pedir de una variante (RF-04), en un solo lugar
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Cero filas si la variante no existe. Con @IDCart nulo (carrito aún sin crear) no suma ninguna reserva.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Cart_AvailableStock (@IDCart INT, @IDVariant INT)
RETURNS TABLE
AS
RETURN
  -- Disponible = lo que no está apartado + lo que la reserva vigente de este mismo carrito ya aparta para la variante:
  -- sin sumarlo, quien reservó 3 de 3 no podría ni repetir la misma cantidad. Puede ser negativa si la existencia bajó.
  SELECT v.IDVariant,
         Available = v.OnHandStock - v.ReservedStock + ISNULL((
           SELECT SUM(rl.Quantity)
           FROM dbo.Reservations AS r
           JOIN dbo.ReservationLines AS rl ON rl.IDReservation = r.IDReservation
           WHERE r.IDCart = @IDCart AND r.Status = N'Active' AND rl.IDVariant = v.IDVariant), 0)
  FROM dbo.Variants AS v
  WHERE v.IDVariant = @IDVariant;
GO
