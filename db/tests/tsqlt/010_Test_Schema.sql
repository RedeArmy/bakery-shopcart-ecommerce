/* =====================================================================
   Objeto   : Test_Schema (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Comprueba la forma del esquema creado por V0001 a V0009
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Schema';
GO

CREATE PROCEDURE Test_Schema.[test every table of the design exists]
AS
BEGIN
    DECLARE @Missing NVARCHAR(MAX) = (
        SELECT STRING_AGG(expected.TableName, N', ')
        FROM (VALUES
            (N'Roles'), (N'Users'), (N'RefreshTokens'),
            (N'Categories'), (N'Products'), (N'ProductImages'), (N'Attributes'), (N'Variants'), (N'VariantAttributes'), (N'Addresses'),
            (N'InventoryMovementTypes'), (N'InventoryMovements'),
            (N'Carts'), (N'CartItems'), (N'Coupons'),
            (N'OrderStatuses'), (N'OrderStatusTransitions'), (N'Orders'), (N'OrderLines'), (N'OrderStatusHistory'), (N'CouponUsages'),
            (N'Reservations'), (N'ReservationLines'),
            (N'PaymentMethods'), (N'PaymentStatuses'), (N'PaymentStatusTransitions'), (N'BankAccounts'), (N'Payments'),
            (N'PaymentStatusHistory'), (N'PaymentDeposits'), (N'PaymentProofs'), (N'ReceivedWebhooks'),
            (N'Returns'), (N'ReturnLines'), (N'Refunds'), (N'FinancialMovements'),
            (N'IdempotentRequests'), (N'AuditLog'), (N'Configuration'), (N'DdlHistory'),
            (N'SchemaVersion'), (N'ObjectVersions')
        ) AS expected (TableName)
        WHERE OBJECT_ID(N'dbo.' + expected.TableName, N'U') IS NULL);

    -- AssertEqualsString no admite NULL: sin tablas ausentes se compara con una cadena vacía
    SET @Missing = ISNULL(@Missing, N'');
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @Missing;
END;
GO

-- El dinero nunca es de coma flotante (ADR-0019)
CREATE PROCEDURE Test_Schema.[test no column uses a floating point or money type]
AS
BEGIN
    DECLARE @Offenders NVARCHAR(MAX) = (
        SELECT STRING_AGG(CONCAT(t.name, N'.', c.name), N', ')
        FROM sys.columns AS c
        JOIN sys.tables AS t ON t.object_id = c.object_id
        JOIN sys.types AS y ON y.user_type_id = c.user_type_id
        WHERE SCHEMA_NAME(t.schema_id) = N'dbo'
          AND y.name IN (N'float', N'real', N'money', N'smallmoney'));

    SET @Offenders = ISNULL(@Offenders, N'');
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @Offenders;
END;
GO

CREATE PROCEDURE Test_Schema.[test every decimal column is DECIMAL(18,2)]
AS
BEGIN
    DECLARE @Offenders NVARCHAR(MAX) = (
        SELECT STRING_AGG(CONCAT(t.name, N'.', c.name, N' is DECIMAL(', c.precision, N',', c.scale, N')'), N', ')
        FROM sys.columns AS c
        JOIN sys.tables AS t ON t.object_id = c.object_id
        JOIN sys.types AS y ON y.user_type_id = c.user_type_id
        WHERE SCHEMA_NAME(t.schema_id) = N'dbo'
          AND y.name IN (N'decimal', N'numeric')
          AND (c.precision <> 18 OR c.scale <> 2));

    SET @Offenders = ISNULL(@Offenders, N'');
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @Offenders;
END;
GO

-- Las marcas de tiempo son DATETIME2(3) en UTC y su nombre termina en At
CREATE PROCEDURE Test_Schema.[test every column ending in At is DATETIME2(3)]
AS
BEGIN
    DECLARE @Offenders NVARCHAR(MAX) = (
        SELECT STRING_AGG(CONCAT(t.name, N'.', c.name), N', ')
        FROM sys.columns AS c
        JOIN sys.tables AS t ON t.object_id = c.object_id
        JOIN sys.types AS y ON y.user_type_id = c.user_type_id
        WHERE SCHEMA_NAME(t.schema_id) = N'dbo'
          -- Comparación binaria: distingue el sufijo At (CreatedAt) de columnas como Vat
          AND c.name COLLATE Latin1_General_100_BIN2 LIKE N'%At'
          AND (y.name <> N'datetime2' OR c.scale <> 3));

    SET @Offenders = ISNULL(@Offenders, N'');
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @Offenders;
END;
GO

-- La clave foránea usa el mismo nombre que la clave que referencia (convención de nombres)
CREATE PROCEDURE Test_Schema.[test every foreign key column keeps the name of the key it references]
AS
BEGIN
    DECLARE @Offenders NVARCHAR(MAX) = (
        SELECT STRING_AGG(CONCAT(OBJECT_NAME(fk.parent_object_id), N'.', pc.name, N' -> ', rc.name), N', ')
        FROM sys.foreign_keys AS fk
        JOIN sys.foreign_key_columns AS fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns AS pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
        JOIN sys.columns AS rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
        WHERE SCHEMA_NAME(fk.schema_id) = N'dbo'
          AND pc.name <> rc.name
          -- Excepciones deliberadas: relaciones con un papel distinto al de la clave (padre, anterior, revisor...)
          AND pc.name NOT IN (N'IDParentCategory', N'IDReplacedBy', N'IDFromStatus', N'IDToStatus',
                              N'IDPreviousStatus', N'IDNewStatus', N'IDReviewerUser'));

    SET @Offenders = ISNULL(@Offenders, N'');
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @Offenders;
END;
GO

-- Los índices de V0010 respaldan las consultas por clave foránea de las tablas transaccionales
CREATE PROCEDURE Test_Schema.[test the foreign keys that back real queries are indexed]
AS
BEGIN
    DECLARE @Missing NVARCHAR(MAX) = (
        SELECT STRING_AGG(expected.IndexName, N', ')
        FROM (VALUES
            (N'Payments', N'IX_Payments_Order'), (N'ProductImages', N'IX_ProductImages_Product'),
            (N'OrderLines', N'IX_OrderLines_Variant'), (N'ReservationLines', N'IX_ReservationLines_Variant'),
            (N'Reservations', N'IX_Reservations_Cart'), (N'InventoryMovements', N'IX_InventoryMovements_Order'),
            (N'FinancialMovements', N'IX_FinancialMovements_Payment')
        ) AS expected (TableName, IndexName)
        WHERE NOT EXISTS (
            SELECT 1 FROM sys.indexes AS i
            WHERE i.object_id = OBJECT_ID(N'dbo.' + expected.TableName) AND i.name = expected.IndexName));

    SET @Missing = ISNULL(@Missing, N'');
    EXEC tSQLt.AssertEqualsString @Expected = N'', @Actual = @Missing;
END;
GO

-- La captura de DDL no debe registrar los objetos de tSQLt, que viven fuera de dbo
CREATE PROCEDURE Test_Schema.[test the DDL trigger records a procedure created in dbo]
AS
BEGIN
    EXEC (N'CREATE PROCEDURE dbo.SP_Fixture_DdlProbe AS SELECT 1;');
    DECLARE @After INT = (SELECT COUNT(*) FROM dbo.DdlHistory WHERE ObjectName = N'SP_Fixture_DdlProbe' AND EventName = N'CREATE_PROCEDURE');

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @After;
END;
GO
