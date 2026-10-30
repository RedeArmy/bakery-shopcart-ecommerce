/* =====================================================================
   Objeto   : Test_Audit (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : SP_Audit_Record escribe la bitácora y rechaza datos inválidos con el código del proyecto
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Audit';
GO

CREATE PROCEDURE Test_Audit.[test an entry keeps the module, the key and both JSON values]
AS
BEGIN
    EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Variant', @EntityKey = N'7', @Action = N'Update',
         @PreviousValue = N'{"Price":"10.00"}', @NewValue = N'{"Price":"12.00"}', @IDUser = NULL;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Products' AND EntityKey = N'7');
    DECLARE @NewValue NVARCHAR(MAX) = (SELECT NewValue FROM dbo.AuditLog WHERE Module = N'Products' AND EntityKey = N'7');

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'{"Price":"12.00"}', @Actual = @NewValue;
END;
GO

CREATE PROCEDURE Test_Audit.[test the values may be absent]
AS
BEGIN
    EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Product', @EntityKey = N'8', @Action = N'Create';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE EntityKey = N'8' AND PreviousValue IS NULL AND NewValue IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Audit.[test an unknown action is rejected as an invalid parameter]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Action must be%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Product', @EntityKey = N'9', @Action = N'Delete';
END;
GO

CREATE PROCEDURE Test_Audit.[test a value that is not JSON is rejected as an invalid parameter]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%valid JSON%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Audit_Record @Module = N'Products', @EntityName = N'Product', @EntityKey = N'9', @Action = N'Update',
         @NewValue = N'not json';
END;
GO

CREATE PROCEDURE Test_Audit.[test a missing module is rejected as an invalid parameter]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Audit_Record @Module = N'  ', @EntityName = N'Product', @EntityKey = N'9', @Action = N'Update';
END;
GO
