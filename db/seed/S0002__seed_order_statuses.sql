/* =====================================================================
   Semilla : S0002 · Estados del pedido y sus transiciones
   Contenido : Ocho estados y once transiciones (docs/architecture/04-state-machines.md)
   Nota      : Idempotente (MERGE). Las transiciones son datos: el procedimiento y el trigger
               TR_Orders_ValidateTransition consultan esta tabla (ADR-0006).
   ===================================================================== */
SET NOCOUNT ON;

MERGE dbo.OrderStatuses AS target
USING (VALUES
  (CAST(1 AS TINYINT), N'PendingPayment'),
  (CAST(2 AS TINYINT), N'Paid'),
  (CAST(3 AS TINYINT), N'InPreparation'),
  (CAST(4 AS TINYINT), N'Dispatched'),
  (CAST(5 AS TINYINT), N'Delivered'),
  (CAST(6 AS TINYINT), N'Cancelled'),
  (CAST(7 AS TINYINT), N'PartiallyReturned'),
  (CAST(8 AS TINYINT), N'Returned')
) AS source (IDOrderStatus, Name)
ON target.IDOrderStatus = source.IDOrderStatus
WHEN MATCHED AND target.Name <> source.Name THEN
  UPDATE SET Name = source.Name
WHEN NOT MATCHED BY TARGET THEN
  INSERT (IDOrderStatus, Name) VALUES (source.IDOrderStatus, source.Name);

-- Una vez despachado, un pedido ya no se cancela: solo se devuelve tras la entrega
MERGE dbo.OrderStatusTransitions AS target
USING (VALUES
  (CAST(1 AS TINYINT), CAST(2 AS TINYINT)),
  (CAST(1 AS TINYINT), CAST(6 AS TINYINT)),
  (CAST(2 AS TINYINT), CAST(3 AS TINYINT)),
  (CAST(2 AS TINYINT), CAST(6 AS TINYINT)),
  (CAST(3 AS TINYINT), CAST(4 AS TINYINT)),
  (CAST(3 AS TINYINT), CAST(6 AS TINYINT)),
  (CAST(4 AS TINYINT), CAST(5 AS TINYINT)),
  (CAST(5 AS TINYINT), CAST(7 AS TINYINT)),
  (CAST(5 AS TINYINT), CAST(8 AS TINYINT)),
  (CAST(7 AS TINYINT), CAST(7 AS TINYINT)),
  (CAST(7 AS TINYINT), CAST(8 AS TINYINT))
) AS source (IDFromStatus, IDToStatus)
ON target.IDFromStatus = source.IDFromStatus AND target.IDToStatus = source.IDToStatus
WHEN NOT MATCHED BY TARGET THEN
  INSERT (IDFromStatus, IDToStatus) VALUES (source.IDFromStatus, source.IDToStatus)
-- La tabla debe quedar igual al conjunto declarado: una transición retirada de aquí deja de ser válida
WHEN NOT MATCHED BY SOURCE THEN
  DELETE;
