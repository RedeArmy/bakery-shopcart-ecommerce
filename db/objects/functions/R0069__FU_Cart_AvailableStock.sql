/* =====================================================================
   Objeto   : dbo.FU_Cart_AvailableStock
   Version  : 1.1.0
   Cambio   : 1.1.0: Disponible en PAQUETES de la variante: las unidades libres de la existencia compartida entre las unidades por paquete, hacia abajo
              Antes: Primera versión: unidades que un carrito puede pedir de una variante (RF-04), en un solo lugar
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Cero filas si la variante no existe. Con @IDCart nulo (carrito aún sin crear) no suma ninguna reserva.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Cart_AvailableStock (@IDCart INT, @IDVariant INT)
RETURNS TABLE
AS
RETURN
  -- Unidades libres = lo que no está apartado + lo que la reserva vigente de este mismo carrito ya aparta de esa existencia
  -- (sumarlo evita que quien reservó 3 de 3 no pueda repetir la misma cantidad). La existencia es compartida por los empaques
  -- del producto y se mide en unidades; lo disponible es un número de PAQUETES de esta variante: unidades libres entre unidades
  -- por paquete, hacia abajo (50 unidades dan 8 bolsas de 6 y sobran 2). Puede ser negativa si la existencia bajó.
  SELECT v.IDVariant,
         Available = CAST(FLOOR(CAST(h.OnHandStock - h.ReservedStock + ISNULL((
           SELECT SUM(rl.Quantity * rv.UnitsPerPack)
           FROM dbo.Reservations AS r
           JOIN dbo.ReservationLines AS rl ON rl.IDReservation = r.IDReservation
           JOIN dbo.Variants AS rv ON rv.IDVariant = rl.IDVariant
           WHERE r.IDCart = @IDCart AND r.Status = N'Active' AND rv.IDStockHolder = h.IDVariant), 0) AS FLOAT)
           / v.UnitsPerPack) AS INT)
  FROM dbo.Variants AS v
  JOIN dbo.Variants AS h ON h.IDVariant = v.IDStockHolder
  WHERE v.IDVariant = @IDVariant;
GO
