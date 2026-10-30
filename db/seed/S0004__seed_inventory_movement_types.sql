/* =====================================================================
   Semilla : S0004 · Tipos de movimiento de inventario
   Contenido : Entry (1), Exit (2), Adjustment (3), Return (4)
   Nota      : Idempotente (MERGE). El índice UX_InventoryMovements_OneExitPerOrder depende de que
               Exit sea el tipo 2.
   ===================================================================== */
SET NOCOUNT ON;

MERGE dbo.InventoryMovementTypes AS target
USING (VALUES
  (CAST(1 AS TINYINT), N'Entry'),
  (CAST(2 AS TINYINT), N'Exit'),
  (CAST(3 AS TINYINT), N'Adjustment'),
  (CAST(4 AS TINYINT), N'Return')
) AS source (IDInventoryMovementType, Name)
ON target.IDInventoryMovementType = source.IDInventoryMovementType
WHEN MATCHED AND target.Name <> source.Name THEN
  UPDATE SET Name = source.Name
WHEN NOT MATCHED BY TARGET THEN
  INSERT (IDInventoryMovementType, Name) VALUES (source.IDInventoryMovementType, source.Name);
