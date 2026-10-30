/* =====================================================================
   Semilla : S0001 · Roles
   Contenido : Customer (1), Operator (2), Administrator (3)
   Nota      : Idempotente (MERGE). Los identificadores son valores fijos que el código y las
               pruebas citan por número; por eso no se pueden reasignar.
   ===================================================================== */
SET NOCOUNT ON;

MERGE dbo.Roles AS target
USING (VALUES
  (CAST(1 AS TINYINT), N'Customer'),
  (CAST(2 AS TINYINT), N'Operator'),
  (CAST(3 AS TINYINT), N'Administrator')
) AS source (IDRole, Name)
ON target.IDRole = source.IDRole
WHEN MATCHED AND target.Name <> source.Name THEN
  UPDATE SET Name = source.Name
WHEN NOT MATCHED BY TARGET THEN
  INSERT (IDRole, Name) VALUES (source.IDRole, source.Name);
