/* =====================================================================
   Objeto   : Test_Environment (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Comprueba que el entorno de pruebas es el esperado
   Autor    : Equipo ShopCart   Fecha: 2026-10-29
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Environment';
GO

-- Una actualización silenciosa de tSQLt cambiaría el comportamiento de todas las pruebas
CREATE PROCEDURE Test_Environment.[test tSQLt is the pinned version]
AS
BEGIN
    DECLARE @Version NVARCHAR(50) = (SELECT Version FROM tSQLt.Info());
    EXEC tSQLt.AssertEqualsString @Expected = N'1.0.8083.3529', @Actual = @Version;
END;
GO

-- El ensamblado CLR de tSQLt debe quedar con el permiso mínimo
CREATE PROCEDURE Test_Environment.[test tSQLtCLR runs with the safe access permission set]
AS
BEGIN
    DECLARE @PermissionSet NVARCHAR(60) =
        (SELECT permission_set_desc FROM sys.assemblies WHERE name = N'tSQLtCLR');
    EXEC tSQLt.AssertEqualsString @Expected = N'SAFE_ACCESS', @Actual = @PermissionSet;
END;
GO

-- TRUSTWORTHY abriría una vía de escalada de privilegios: la base de pruebas no debe tenerlo
CREATE PROCEDURE Test_Environment.[test the test database is not trustworthy]
AS
BEGIN
    DECLARE @IsTrustworthy INT =
        (SELECT CAST(is_trustworthy_on AS INT) FROM sys.databases WHERE name = DB_NAME());
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @IsTrustworthy;
END;
GO

-- Defensa en profundidad: aunque el ejecutor ya lo valida, la propia base se niega a ser la entregada
CREATE PROCEDURE Test_Environment.[test the database name ends in _CI]
AS
BEGIN
    DECLARE @EndsInCi INT = CASE WHEN RIGHT(DB_NAME(), 3) = N'_CI' THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @EndsInCi;
END;
GO
