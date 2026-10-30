/* =====================================================================
   Objeto   : Test_System (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : SP_System_GetSchemaVersion devuelve la última migración aplicada con éxito
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_System';
GO

-- Aquí FakeTable solo aísla la lógica del procedimiento: no se prueban restricciones
CREATE PROCEDURE Test_System.SetUp
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.SchemaVersion';
END;
GO

CREATE PROCEDURE Test_System.[test SP_System_GetSchemaVersion returns the highest applied migration]
AS
BEGIN
    INSERT INTO dbo.SchemaVersion (Number, Type, IsSuccessful) VALUES (1, 'V', 1), (2, 'V', 1), (10, 'V', 1), (3, 'V', 1);

    CREATE TABLE #Actual (SchemaVersion INT);
    INSERT INTO #Actual EXEC dbo.SP_System_GetSchemaVersion;

    DECLARE @Version INT = (SELECT SchemaVersion FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @Version;
END;
GO

CREATE PROCEDURE Test_System.[test SP_System_GetSchemaVersion ignores failed migrations]
AS
BEGIN
    INSERT INTO dbo.SchemaVersion (Number, Type, IsSuccessful) VALUES (1, 'V', 1), (2, 'V', 1), (3, 'V', 0);

    CREATE TABLE #Actual (SchemaVersion INT);
    INSERT INTO #Actual EXEC dbo.SP_System_GetSchemaVersion;

    DECLARE @Version INT = (SELECT SchemaVersion FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Version;
END;
GO

-- Los objetos y las semillas tienen su propia numeración y no son la versión del esquema
CREATE PROCEDURE Test_System.[test SP_System_GetSchemaVersion counts only migrations]
AS
BEGIN
    INSERT INTO dbo.SchemaVersion (Number, Type, IsSuccessful) VALUES (4, 'V', 1), (900, 'R', 1), (50, 'S', 1);

    CREATE TABLE #Actual (SchemaVersion INT);
    INSERT INTO #Actual EXEC dbo.SP_System_GetSchemaVersion;

    DECLARE @Version INT = (SELECT SchemaVersion FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Version;
END;
GO

CREATE PROCEDURE Test_System.[test SP_System_GetSchemaVersion returns zero before any migration]
AS
BEGIN
    CREATE TABLE #Actual (SchemaVersion INT);
    INSERT INTO #Actual EXEC dbo.SP_System_GetSchemaVersion;

    DECLARE @Version INT = (SELECT SchemaVersion FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Version;
END;
GO
