/* =====================================================================
   Objeto   : Test_Addresses (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : La libreta de direcciones es privada de cada cliente (anti-IDOR dentro de la base de datos)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Addresses';
GO

CREATE PROCEDURE Test_Addresses.SetUp
AS
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE IDRole = 1) INSERT INTO dbo.Roles (IDRole, Name) VALUES (1, N'Customer');

    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    VALUES (1, N'ana@shopcart.test', N'not-a-real-hash', N'Ana'),
           (1, N'luis@shopcart.test', N'not-a-real-hash', N'Luis');
END;
GO

CREATE PROCEDURE Test_Addresses.[test saving a new address stores it for the user trimmed]
AS
BEGIN
    DECLARE @IDAna INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'ana@shopcart.test');
    DECLARE @IDAddress INT;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @Label = N' Home ', @Recipient = N'Ana', @Phone = N'55550000', @Line1 = N'5th Avenue 10-20',
         @Municipality = N'Guatemala', @Department = N'Guatemala', @IDSavedAddress = @IDAddress OUTPUT;

    DECLARE @Label NVARCHAR(40) = (SELECT Label FROM dbo.Addresses WHERE IDAddress = @IDAddress AND IDUser = @IDAna AND IsActive = 1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Home', @Actual = @Label;
END;
GO

CREATE PROCEDURE Test_Addresses.[test the list shows only the addresses of the user]
AS
BEGIN
    DECLARE @IDAna INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'ana@shopcart.test');
    DECLARE @IDLuis INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'luis@shopcart.test');
    DECLARE @First INT, @Second INT;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000', @Line1 = N'Line 1',
         @Municipality = N'M', @Department = N'D', @IDSavedAddress = @First OUTPUT;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDLuis, @Label = N'Office', @Recipient = N'Luis', @Phone = N'55551111', @Line1 = N'Line 2',
         @Municipality = N'M', @Department = N'D', @IDSavedAddress = @Second OUTPUT;

    CREATE TABLE #Result (IDAddress INT, Label NVARCHAR(40), Recipient NVARCHAR(120), Phone NVARCHAR(20), Line1 NVARCHAR(200), Line2 NVARCHAR(200),
                          Municipality NVARCHAR(80), Department NVARCHAR(80), Reference NVARCHAR(200), IsActive BIT);
    INSERT INTO #Result EXEC dbo.SP_Addresses_List @IDUser = @IDAna;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    DECLARE @Foreign INT = (SELECT COUNT(*) FROM #Result WHERE IDAddress = @Second);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Foreign;
END;
GO

CREATE PROCEDURE Test_Addresses.[test editing an own address changes it]
AS
BEGIN
    DECLARE @IDAna INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'ana@shopcart.test');
    DECLARE @IDAddress INT, @Saved INT;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000', @Line1 = N'Line 1',
         @Municipality = N'M', @Department = N'D', @IDSavedAddress = @IDAddress OUTPUT;

    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @IDAddress = @IDAddress, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000',
         @Line1 = N'New line', @Municipality = N'M', @Department = N'D', @IDSavedAddress = @Saved OUTPUT;

    DECLARE @Line1 NVARCHAR(200) = (SELECT Line1 FROM dbo.Addresses WHERE IDAddress = @IDAddress);
    EXEC tSQLt.AssertEqualsString @Expected = N'New line', @Actual = @Line1;
    EXEC tSQLt.AssertEquals @Expected = @IDAddress, @Actual = @Saved;
END;
GO

-- Anti-IDOR: editar la dirección de otra persona responde igual que una inexistente y no la modifica
CREATE PROCEDURE Test_Addresses.[test editing another customer's address answers not found and changes nothing]
AS
BEGIN
    DECLARE @IDAna INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'ana@shopcart.test');
    DECLARE @IDLuis INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'luis@shopcart.test');
    DECLARE @IDAddress INT, @Saved INT;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000', @Line1 = N'Ana line',
         @Municipality = N'M', @Department = N'D', @IDSavedAddress = @IDAddress OUTPUT;

    BEGIN TRY
        EXEC dbo.SP_Addresses_Save @IDUser = @IDLuis, @IDAddress = @IDAddress, @Label = N'Stolen', @Recipient = N'Luis', @Phone = N'1',
             @Line1 = N'Luis line', @Municipality = N'M', @Department = N'D', @IDSavedAddress = @Saved OUTPUT;
    END TRY
    BEGIN CATCH
        DECLARE @ErrorNumber INT = ERROR_NUMBER();
    END CATCH;

    DECLARE @Line1 NVARCHAR(200) = (SELECT Line1 FROM dbo.Addresses WHERE IDAddress = @IDAddress);
    DECLARE @Owner INT = (SELECT IDUser FROM dbo.Addresses WHERE IDAddress = @IDAddress);
    EXEC tSQLt.AssertEquals @Expected = 50404, @Actual = @ErrorNumber;
    EXEC tSQLt.AssertEqualsString @Expected = N'Ana line', @Actual = @Line1;
    EXEC tSQLt.AssertEquals @Expected = @IDAna, @Actual = @Owner;
END;
GO

CREATE PROCEDURE Test_Addresses.[test an address is retired without being deleted]
AS
BEGIN
    DECLARE @IDAna INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'ana@shopcart.test');
    DECLARE @IDAddress INT, @Saved INT;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000', @Line1 = N'Line 1',
         @Municipality = N'M', @Department = N'D', @IDSavedAddress = @IDAddress OUTPUT;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @IDAddress = @IDAddress, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000',
         @Line1 = N'Line 1', @Municipality = N'M', @Department = N'D', @IsActive = 0, @IDSavedAddress = @Saved OUTPUT;

    CREATE TABLE #Result (IDAddress INT, Label NVARCHAR(40), Recipient NVARCHAR(120), Phone NVARCHAR(20), Line1 NVARCHAR(200), Line2 NVARCHAR(200),
                          Municipality NVARCHAR(80), Department NVARCHAR(80), Reference NVARCHAR(200), IsActive BIT);
    INSERT INTO #Result EXEC dbo.SP_Addresses_List @IDUser = @IDAna;
    DECLARE @Visible INT = (SELECT COUNT(*) FROM #Result);
    DELETE FROM #Result;
    INSERT INTO #Result EXEC dbo.SP_Addresses_List @IDUser = @IDAna, @IncludeInactive = 1;
    DECLARE @All INT = (SELECT COUNT(*) FROM #Result);

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Visible;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @All;
END;
GO

CREATE PROCEDURE Test_Addresses.[test a new address cannot be created inactive]
AS
BEGIN
    DECLARE @IDAna INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'ana@shopcart.test');
    DECLARE @IDAddress INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%cannot be created inactive%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @Label = N'Home', @Recipient = N'Ana', @Phone = N'55550000', @Line1 = N'Line 1',
         @Municipality = N'M', @Department = N'D', @IsActive = 0, @IDSavedAddress = @IDAddress OUTPUT;
END;
GO

CREATE PROCEDURE Test_Addresses.[test an address without its required fields is rejected]
AS
BEGIN
    DECLARE @IDAna INT = (SELECT IDUser FROM dbo.Users WHERE Email = N'ana@shopcart.test');
    DECLARE @IDAddress INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Addresses_Save @IDUser = @IDAna, @Label = N'Home', @Recipient = N'  ', @Phone = N'55550000', @Line1 = N'Line 1',
         @Municipality = N'M', @Department = N'D', @IDSavedAddress = @IDAddress OUTPUT;
END;
GO

CREATE PROCEDURE Test_Addresses.[test the list needs a user]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%IDUser is required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Addresses_List @IDUser = NULL;
END;
GO
