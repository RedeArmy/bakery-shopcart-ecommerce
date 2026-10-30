/* =====================================================================
   Migración : V0003 · Libro de inventario
   Contenido : InventoryMovementTypes, InventoryMovements
   Nota      : La clave foránea hacia Orders se añade en V0005, cuando existe la tabla.
   ===================================================================== */
SET NOCOUNT ON;

-- 1 Entry, 2 Exit, 3 Adjustment, 4 Return (valores fijos que cargan las semillas)
CREATE TABLE dbo.InventoryMovementTypes (
  IDInventoryMovementType TINYINT      NOT NULL CONSTRAINT PK_InventoryMovementTypes PRIMARY KEY,
  Name                    NVARCHAR(30) NOT NULL CONSTRAINT UQ_InventoryMovementTypes_Name UNIQUE
);

-- Solo registra movimientos físicos: una reserva no deja rastro aquí, así que un pedido abandonado no hace ruido
CREATE TABLE dbo.InventoryMovements (
  IDInventoryMovement     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_InventoryMovements PRIMARY KEY,
  IDVariant               INT                  NOT NULL CONSTRAINT FK_InventoryMovements_Variants REFERENCES dbo.Variants (IDVariant),
  IDInventoryMovementType TINYINT              NOT NULL CONSTRAINT FK_InventoryMovements_Types REFERENCES dbo.InventoryMovementTypes (IDInventoryMovementType),
  -- Con signo: las salidas restan
  Quantity                INT                  NOT NULL CONSTRAINT CK_InventoryMovements_Quantity CHECK (Quantity <> 0),
  ResultingBalance        INT                  NOT NULL CONSTRAINT CK_InventoryMovements_ResultingBalance CHECK (ResultingBalance >= 0),
  Reason                  NVARCHAR(250)        NOT NULL,
  IDUser                  INT                  NOT NULL CONSTRAINT FK_InventoryMovements_Users REFERENCES dbo.Users (IDUser),
  IDOrder                 INT                  NULL,
  CreatedAt               DATETIME2(3)         NOT NULL CONSTRAINT DF_InventoryMovements_CreatedAt DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_InventoryMovements_Variant_CreatedAt ON dbo.InventoryMovements (IDVariant, CreatedAt)
  INCLUDE (Quantity, ResultingBalance);

-- Una sola salida por (pedido, variante): segunda línea de defensa contra descontar dos veces.
-- Se limita al tipo Exit porque las devoluciones parciales sí pueden repetirse.
CREATE UNIQUE INDEX UX_InventoryMovements_OneExitPerOrder ON dbo.InventoryMovements (IDOrder, IDVariant)
  WHERE IDInventoryMovementType = 2 AND IDOrder IS NOT NULL;
