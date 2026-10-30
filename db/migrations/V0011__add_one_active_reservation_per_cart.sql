/* =====================================================================
   Migración : V0011 · Una sola reserva activa por carrito
   Contenido : Índice único filtrado UX_Reservations_OneActivePerCart
   Nota      : SP_Inventory_ReserveStock ya serializa las solicitudes del mismo carrito con un bloqueo, pero la regla
               "un carrito no retiene stock dos veces" protege dinero e inventario, así que también vive en los datos
               como segunda línea de defensa (ADR-0007). Una reserva ligada a un pedido deja de contar: el carrito
               ya está convertido y el pedido es quien conserva las existencias.
   ===================================================================== */
SET NOCOUNT ON;

CREATE UNIQUE INDEX UX_Reservations_OneActivePerCart ON dbo.Reservations (IDCart)
  WHERE Status = N'Active' AND IDOrder IS NULL;
