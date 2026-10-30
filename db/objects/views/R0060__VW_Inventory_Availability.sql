/* =====================================================================
   Objeto   : dbo.VW_Inventory_Availability
   Version  : 1.0.0
   Cambio   : Primera versión: existencias físicas, reservadas y disponibles de cada variante
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una fila por variante, activa o no.
   ===================================================================== */
CREATE OR ALTER VIEW dbo.VW_Inventory_Availability
AS
  -- Disponible = físico - reservado. Es la misma resta que protege SP_Inventory_ReserveStock; tenerla en un solo lugar
  -- evita que el catálogo y la reserva calculen la disponibilidad de forma distinta.
  SELECT v.IDVariant, v.IDProduct, v.SKU, v.IsActive, v.OnHandStock, v.ReservedStock,
         AvailableStock = v.OnHandStock - v.ReservedStock
  FROM dbo.Variants AS v;
GO
