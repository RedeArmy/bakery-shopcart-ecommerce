/* =====================================================================
   Migración : V0010 · Índices de apoyo para claves foráneas
   Contenido : Siete índices sobre columnas que se consultan o se recorren
   Nota      : Una auditoría de V0001 a V0009 encontró 41 claves foráneas sin índice que empiece por su columna.
               Solo se indexan las que respaldan una consulta real. No se indexan las que apuntan a tablas
               de referencia diminutas (roles, estados, métodos): un índice allí no se usaría nunca.
   ===================================================================== */
SET NOCOUNT ON;

-- Todos los pagos de un pedido (historial, conciliación). Los índices únicos filtrados de V0007
-- solo sirven cuando la consulta ya filtra por estado.
CREATE INDEX IX_Payments_Order ON dbo.Payments (IDOrder) INCLUDE (IDPaymentStatus, IDPaymentMethod);

-- Imágenes de un producto en su orden de presentación; el índice filtrado de V0002 solo ve la principal
CREATE INDEX IX_ProductImages_Product ON dbo.ProductImages (IDProduct, SortOrder);

-- Ventas por variante (los más vendidos) sin recorrer todas las líneas
CREATE INDEX IX_OrderLines_Variant ON dbo.OrderLines (IDVariant) INCLUDE (IDOrder, Quantity);

-- Conciliación de ExistenciaReservada: suma de las reservas activas de una variante
CREATE INDEX IX_ReservationLines_Variant ON dbo.ReservationLines (IDVariant) INCLUDE (Quantity);

-- Liberar las reservas de un carrito
CREATE INDEX IX_Reservations_Cart ON dbo.Reservations (IDCart);

-- Movimientos de un pedido (salidas y devoluciones). Filtrado: la mayoría de los movimientos no tiene pedido.
CREATE INDEX IX_InventoryMovements_Order ON dbo.InventoryMovements (IDOrder) WHERE IDOrder IS NOT NULL;

-- Libro de dinero de un pago. El índice único de V0007 solo cubre los cobros.
CREATE INDEX IX_FinancialMovements_Payment ON dbo.FinancialMovements (IDPayment) INCLUDE (Type, Amount)
  WHERE IDPayment IS NOT NULL;
