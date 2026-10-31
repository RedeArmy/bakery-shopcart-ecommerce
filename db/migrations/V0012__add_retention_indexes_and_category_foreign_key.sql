/* =====================================================================
   Migración : V0012 · Índices de operación, retención e integridad de la categoría
   Contenido : Siete índices para consultas y purgas reales, el reemplazo de IX_RefreshTokens_Family y la clave foránea
               OrderLines.IDCategory.
   Nota      : Una auditoría con 50 000 pedidos, 20 000 carritos, 200 000 tokens y 200 000 filas de auditoría mostró consultas
               que recorrían tablas enteras por falta de un índice, y tablas que solo crecen porque nada las purga
               (SP_Retention_Purge, R0344). Cada índice respalda una consulta concreta; ninguno es especulativo.
   ===================================================================== */
SET NOCOUNT ON;

-- El historial de un pedido, producto o cupón se pide por (módulo, entidad). El índice por (módulo, fecha) obligaba a leer
-- todo el módulo y filtrar por la clave de la entidad.
CREATE INDEX IX_AuditLog_Entity ON dbo.AuditLog (Module, EntityKey);

-- El job de expiración busca cada 60 segundos las reservas activas sin pedido que ya vencieron. IX_Reservations_Expiry
-- (estado, vencimiento) contiene también las millones de reservas históricas; este solo contiene las que pueden vencer.
CREATE INDEX IX_Reservations_ActiveExpiry ON dbo.Reservations (ExpiresAt) WHERE Status = N'Active' AND IDOrder IS NULL;

-- Carritos abandonados (panel de control) y purga de carritos de visitante: ambos filtran por última actividad. Sin este
-- índice cada consulta recorría todos los carritos, y los visitantes que solo miran crean uno cada vez.
CREATE INDEX IX_Carts_LastActivity ON dbo.Carts (LastActivityAt) INCLUDE (Status, IDUser);

-- La purga de tokens de refresco elige familias enteras cuyo último vencimiento ya pasó. El índice nuevo conserva IDFamily
-- como primera columna, así que reemplaza al anterior sin perder ninguna búsqueda por familia.
CREATE INDEX IX_RefreshTokens_Family_Expiry ON dbo.RefreshTokens (IDFamily, ExpiresAt);
DROP INDEX IX_RefreshTokens_Family ON dbo.RefreshTokens;

-- El listado de cuentas del panel se ordena por alta, de la más reciente a la más antigua. Sin este índice ordena todas las
-- cuentas en cada página.
CREATE INDEX IX_Users_CreatedAt ON dbo.Users (CreatedAt DESC, IDUser DESC);

-- Purgas por antigüedad de las dos tablas que solo reciben inserciones
CREATE INDEX IX_ReceivedWebhooks_ReceivedAt ON dbo.ReceivedWebhooks (ReceivedAt);
CREATE INDEX IX_DdlHistory_CreatedAt ON dbo.DdlHistory (CreatedAt);

-- La línea de pedido guarda una copia de la categoría para los reportes, pero seguía siendo un entero sin garantía: una
-- categoría inexistente habría distorsionado las ventas por categoría sin ningún error. Las categorías se desactivan, no
-- se borran, así que la clave no estorba. WITH CHECK valida las filas existentes.
ALTER TABLE dbo.OrderLines WITH CHECK ADD CONSTRAINT FK_OrderLines_Categories FOREIGN KEY (IDCategory) REFERENCES dbo.Categories (IDCategory);
