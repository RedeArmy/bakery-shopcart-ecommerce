/* =====================================================================
   Semilla : S0003 · Métodos y estados de pago, y sus transiciones
   Contenido : Dos métodos, ocho estados y nueve transiciones (docs/architecture/04-state-machines.md)
   Nota      : Idempotente (MERGE). El estado del pago es independiente del estado del pedido (ADR-0015).
   ===================================================================== */
SET NOCOUNT ON;

-- Los códigos son los que viajan por la API; el texto que ve el cliente vive en los archivos de i18n
MERGE dbo.PaymentMethods AS target
USING (VALUES
  (CAST(1 AS TINYINT), N'CARD', N'Card'),
  (CAST(2 AS TINYINT), N'BANK_DEPOSIT', N'BankDeposit')
) AS source (IDPaymentMethod, Code, Name)
ON target.IDPaymentMethod = source.IDPaymentMethod
WHEN MATCHED AND (target.Code <> source.Code OR target.Name <> source.Name) THEN
  UPDATE SET Code = source.Code, Name = source.Name
WHEN NOT MATCHED BY TARGET THEN
  INSERT (IDPaymentMethod, Code, Name) VALUES (source.IDPaymentMethod, source.Code, source.Name);

MERGE dbo.PaymentStatuses AS target
USING (VALUES
  (CAST(1 AS TINYINT), N'Pending'),
  (CAST(2 AS TINYINT), N'UnderReview'),
  (CAST(3 AS TINYINT), N'Approved'),
  (CAST(4 AS TINYINT), N'Rejected'),
  (CAST(5 AS TINYINT), N'Failed'),
  (CAST(6 AS TINYINT), N'Expired'),
  (CAST(7 AS TINYINT), N'Refunded'),
  (CAST(8 AS TINYINT), N'Cancelled')
) AS source (IDPaymentStatus, Name)
ON target.IDPaymentStatus = source.IDPaymentStatus
WHEN MATCHED AND target.Name <> source.Name THEN
  UPDATE SET Name = source.Name
WHEN NOT MATCHED BY TARGET THEN
  INSERT (IDPaymentStatus, Name) VALUES (source.IDPaymentStatus, source.Name);

-- Un pago en revisión no vence por tiempo: lo resuelve un operador (por eso no hay transición 2 -> 6)
MERGE dbo.PaymentStatusTransitions AS target
USING (VALUES
  (CAST(1 AS TINYINT), CAST(2 AS TINYINT)),
  (CAST(1 AS TINYINT), CAST(3 AS TINYINT)),
  (CAST(1 AS TINYINT), CAST(5 AS TINYINT)),
  (CAST(1 AS TINYINT), CAST(6 AS TINYINT)),
  (CAST(1 AS TINYINT), CAST(8 AS TINYINT)),
  (CAST(2 AS TINYINT), CAST(3 AS TINYINT)),
  (CAST(2 AS TINYINT), CAST(4 AS TINYINT)),
  (CAST(2 AS TINYINT), CAST(8 AS TINYINT)),
  (CAST(3 AS TINYINT), CAST(7 AS TINYINT))
) AS source (IDFromStatus, IDToStatus)
ON target.IDFromStatus = source.IDFromStatus AND target.IDToStatus = source.IDToStatus
WHEN NOT MATCHED BY TARGET THEN
  INSERT (IDFromStatus, IDToStatus) VALUES (source.IDFromStatus, source.IDToStatus)
WHEN NOT MATCHED BY SOURCE THEN
  DELETE;
