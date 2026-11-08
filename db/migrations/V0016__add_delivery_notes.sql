/* =====================================================================
   Migración : V0016__add_delivery_notes
   Cambio    : Notas de entrega opcionales del pedido ("tocar el timbre dos veces", "dejar con el guardia"). El cliente las
               escribe en el checkout y la persona que entrega las lee en el detalle del pedido.
   Forward   : Solo agrega una columna que admite NULL; ningún dato existente cambia y los pedidos anteriores quedan sin notas.
   ===================================================================== */

ALTER TABLE dbo.Orders ADD DeliveryNotes NVARCHAR(300) NULL;
GO
