/* =====================================================================
   Objeto   : dbo.VW_Inventory_Reconciliation
   Version  : 1.1.0
   Cambio   : 1.1.0: lo reservado se compara por variante que guarda la existencia y en unidades (cantidad de paquetes por unidades por paquete)
              Antes: Primera versión: variantes cuyos contadores no cuadran con su libro o con sus reservas
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Debe devolver CERO filas; cada fila es una discrepancia con su causa en Issue.
   ===================================================================== */
CREATE OR ALTER VIEW dbo.VW_Inventory_Reconciliation
AS
  -- 1. La existencia física debe ser exactamente la suma con signo del libro de inventario. Una variante sin movimientos
  --    debe estar en cero, porque las variantes nacen sin existencias y solo el libro las modifica.
  SELECT v.IDVariant, v.SKU, Issue = CAST(N'OnHandVsLedger' AS NVARCHAR(30)),
         Expected = ISNULL(l.Balance, 0), Actual = CAST(v.OnHandStock AS BIGINT)
  FROM dbo.Variants AS v
  LEFT JOIN (
    SELECT IDVariant, Balance = SUM(CAST(Quantity AS BIGINT)) FROM dbo.InventoryMovements GROUP BY IDVariant
  ) AS l ON l.IDVariant = v.IDVariant
  WHERE v.OnHandStock <> ISNULL(l.Balance, 0)

  UNION ALL

  -- 2. Lo reservado debe ser exactamente la suma de las líneas de las reservas activas, tengan o no pedido: una reserva
  --    ligada a un pedido sigue reteniendo existencias hasta que el pago la consume.
  SELECT v.IDVariant, v.SKU, N'ReservedVsReservations', ISNULL(r.Held, 0), CAST(v.ReservedStock AS BIGINT)
  FROM dbo.Variants AS v
  LEFT JOIN (
    SELECT sv.IDStockHolder, Held = SUM(CAST(rl.Quantity AS BIGINT) * sv.UnitsPerPack)
    FROM dbo.ReservationLines AS rl
    JOIN dbo.Reservations AS res ON res.IDReservation = rl.IDReservation AND res.Status = N'Active'
    JOIN dbo.Variants AS sv ON sv.IDVariant = rl.IDVariant
    GROUP BY sv.IDStockHolder
  ) AS r ON r.IDStockHolder = v.IDVariant
  WHERE v.ReservedStock <> ISNULL(r.Held, 0);
GO
