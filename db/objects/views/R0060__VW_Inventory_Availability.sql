/* =====================================================================
   Objeto   : dbo.VW_Inventory_Availability
   Version  : 1.1.0
   Cambio   : 1.1.0: cada variante muestra la existencia compartida del producto (en unidades) y cuántos paquetes suyos se pueden comprar
              Antes: Primera versión: existencias físicas, reservadas y disponibles de cada variante
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila por variante, activa o no.
   ===================================================================== */
CREATE OR ALTER VIEW dbo.VW_Inventory_Availability
AS
  -- Disponible = físico - reservado. Es la misma resta que protege SP_Inventory_ReserveStock; tenerla en un solo lugar
  -- evita que el catálogo y la reserva calculen la disponibilidad de forma distinta.
  SELECT v.IDVariant, v.IDProduct, v.SKU, v.IsActive, h.OnHandStock, h.ReservedStock,
         AvailableStock = h.OnHandStock - h.ReservedStock,
         v.UnitsPerPack,
         AvailablePacks = CAST((h.OnHandStock - h.ReservedStock) / v.UnitsPerPack AS INT)
  FROM dbo.Variants AS v
  JOIN dbo.Variants AS h ON h.IDVariant = v.IDStockHolder;
GO
