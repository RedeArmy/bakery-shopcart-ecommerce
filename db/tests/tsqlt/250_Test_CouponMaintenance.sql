/* =====================================================================
   Objeto   : Test_CouponMaintenance (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Cupones: filtro del listado por estado, reactivación y borrado definitivo de un cupón desactivado
   Autor    : Equipo ShopCart   Fecha: 2026-11-09
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023)
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_CouponMaintenance';
GO

-- La tienda de ejemplo con sus cupones: WELCOME10, FIXED10 y CAKES25 vigentes en 2030 y EXPIRED vencido
CREATE PROCEDURE Test_CouponMaintenance.SetUp
AS
BEGIN
    EXEC Test_Coupons.SetUp;
END;
GO

-- Ayudas ------------------------------------------------------------------------------------

CREATE FUNCTION Test_CouponMaintenance.CouponId (@Code NVARCHAR(30)) RETURNS INT
AS
BEGIN
    RETURN (SELECT IDCoupon FROM dbo.Coupons WHERE Code = @Code);
END;
GO

-- Los códigos que devuelve el listado con un estado, separados por coma y en orden alfabético
CREATE PROCEDURE Test_CouponMaintenance.Codes @Status VARCHAR(10), @Codes NVARCHAR(200) OUTPUT
AS
BEGIN
    CREATE TABLE #Result (IDCoupon INT, Code NVARCHAR(30), Type NVARCHAR(12), Value NVARCHAR(25), MinimumAmount NVARCHAR(25), StartsAt DATETIME2(3),
                          EndsAt DATETIME2(3), TotalUsageLimit INT, PerCustomerUsageLimit INT, UsageCount INT, IDCategory INT, IsActive BIT,
                          Status VARCHAR(12), TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Coupons_List @Status = @Status, @Now = '2030-06-01T12:00:00';
    SET @Codes = ISNULL((SELECT STRING_AGG(Code, N',') WITHIN GROUP (ORDER BY Code) FROM #Result), N'');
END;
GO

-- Filtro del listado ----------------------------------------------------------------------------

CREATE PROCEDURE Test_CouponMaintenance.[test the list can show all the coupons, deactivated ones included]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Fixed INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @Fixed;
    DECLARE @Codes NVARCHAR(200);
    EXEC Test_CouponMaintenance.Codes @Status = 'All', @Codes = @Codes OUTPUT;
    EXEC tSQLt.AssertEqualsString @Expected = N'CAKES25,EXPIRED,FIXED10,WELCOME10', @Actual = @Codes;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test the list of current coupons leaves out the expired, the exhausted, the not started and the deactivated]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    -- FIXED10 desactivado, CAKES25 agotado, y un cupón que empieza en 2031
    DECLARE @IdFIXED10 INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @IdFIXED10;
    UPDATE dbo.Coupons SET TotalUsageLimit = 1, UsageCount = 1 WHERE Code = N'CAKES25';
    INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt)
    VALUES (N'FUTURE5', N'FixedAmount', 5.00, 0.00, '2031-01-01', '2031-12-31');

    DECLARE @Codes NVARCHAR(200);
    EXEC Test_CouponMaintenance.Codes @Status = 'Active', @Codes = @Codes OUTPUT;

    -- Solo WELCOME10: EXPIRED venció, CAKES25 se agotó, FUTURE5 aún no empieza y FIXED10 está desactivado
    EXEC tSQLt.AssertEqualsString @Expected = N'WELCOME10', @Actual = @Codes;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test the list of deactivated coupons shows only those]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IdFIXED10 INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @IdFIXED10;
    DECLARE @IdEXPIRED INT = Test_CouponMaintenance.CouponId(N'EXPIRED');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @IdEXPIRED;

    DECLARE @Codes NVARCHAR(200);
    EXEC Test_CouponMaintenance.Codes @Status = 'Inactive', @Codes = @Codes OUTPUT;

    EXEC tSQLt.AssertEqualsString @Expected = N'EXPIRED,FIXED10', @Actual = @Codes;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test the list without a state keeps the old behaviour]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IdFIXED10 INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @IdFIXED10;
    DECLARE @Codes NVARCHAR(200);
    EXEC Test_CouponMaintenance.Codes @Status = NULL, @Codes = @Codes OUTPUT;
    EXEC tSQLt.AssertEqualsString @Expected = N'CAKES25,EXPIRED,WELCOME10', @Actual = @Codes;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test the list rejects a state it does not know]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Status must be All, Active or Inactive%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Coupons_List @Status = 'Expired';
END;
GO

-- Reactivar -------------------------------------------------------------------------------------

CREATE PROCEDURE Test_CouponMaintenance.[test reactivating brings a deactivated coupon back and audits it once]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Fixed INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @Fixed;

    EXEC dbo.SP_Coupons_Reactivate @IDActor = @Admin, @IDCoupon = @Fixed;
    EXEC dbo.SP_Coupons_Reactivate @IDActor = @Admin, @IDCoupon = @Fixed;

    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Coupons WHERE IDCoupon = @Fixed);
    DECLARE @Audit INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Coupons' AND Action = N'StatusChange' AND EntityKey = CAST(@Fixed AS NVARCHAR(40)));
    DECLARE @Codes NVARCHAR(200);
    EXEC Test_CouponMaintenance.Codes @Status = 'Active', @Codes = @Codes OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audit;   -- la segunda llamada no cambia nada y no deja otra entrada
    EXEC tSQLt.AssertEqualsString @Expected = N'CAKES25,FIXED10,WELCOME10', @Actual = @Codes;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test reactivating a coupon whose validity has passed leaves it expired]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Expired INT = Test_CouponMaintenance.CouponId(N'EXPIRED');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @Expired;

    EXEC dbo.SP_Coupons_Reactivate @IDActor = @Admin, @IDCoupon = @Expired;

    DECLARE @Codes NVARCHAR(200);
    EXEC Test_CouponMaintenance.Codes @Status = 'Active', @Codes = @Codes OUTPUT;
    DECLARE @Listed INT = CASE WHEN CHARINDEX(N'EXPIRED', @Codes) > 0 THEN 1 ELSE 0 END;
    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Coupons WHERE IDCoupon = @Expired);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Listed;   -- activo, pero su vigencia ya pasó
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test only an administrator can reactivate]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Fixed INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Coupons_Reactivate @IDActor = @Ana, @IDCoupon = @Fixed;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test reactivating an unknown coupon says it was not found]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Coupon not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Coupons_Reactivate @IDActor = @Admin, @IDCoupon = -1;
END;
GO

-- Borrar ----------------------------------------------------------------------------------------

CREATE PROCEDURE Test_CouponMaintenance.[test a deactivated coupon that nothing used is deleted for good and the audit keeps it]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Fixed INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @Fixed;

    EXEC dbo.SP_Coupons_Delete @IDActor = @Admin, @IDCoupon = @Fixed;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.Coupons WHERE Code = N'FIXED10');
    DECLARE @Others INT = (SELECT COUNT(*) FROM dbo.Coupons);
    DECLARE @Key NVARCHAR(40) = CAST(@Fixed AS NVARCHAR(40));
    DECLARE @Deleted INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Coupons' AND EntityKey = @Key AND NewValue = N'{"Deleted":true}');
    DECLARE @Kept INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Coupons' AND EntityKey = @Key AND PreviousValue LIKE N'%FIXED10%');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Others;   -- los demás no se tocan
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Deleted;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Kept;   -- la bitácora guarda el cupón como era
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test an active coupon cannot be deleted]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Fixed INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Only a deactivated coupon can be deleted%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Coupons_Delete @IDActor = @Admin, @IDCoupon = @Fixed;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test a coupon that an order used cannot be deleted]
AS
BEGIN
    -- El pedido del ejemplo de las pruebas de restricciones cita el cupón
    EXEC Test_Fixtures.CreateBaseData;
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Fixed INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    UPDATE dbo.Orders SET IDCoupon = @Fixed WHERE OrderNumber = N'FIX-0001';
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @Fixed;

    DECLARE @Error NVARCHAR(400) = N'';
    BEGIN TRY
        EXEC dbo.SP_Coupons_Delete @IDActor = @Admin, @IDCoupon = @Fixed;
    END TRY
    BEGIN CATCH
        SET @Error = ERROR_MESSAGE();
    END CATCH;

    DECLARE @Refused INT = CASE WHEN @Error LIKE N'%an order used%' THEN 1 ELSE 0 END;
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.Coupons WHERE IDCoupon = @Fixed);
    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.Coupons WHERE IDCoupon = @Fixed);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Refused;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;   -- se conserva, desactivado
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test deleting a coupon takes it off the carts that still held it]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Fixed INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    INSERT INTO dbo.Carts (IDUser, Status, IDCoupon) VALUES (@Ana, N'Active', @Fixed);
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @Fixed;

    EXEC dbo.SP_Coupons_Delete @IDActor = @Admin, @IDCoupon = @Fixed;

    DECLARE @StillHeld INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDUser = @Ana AND IDCoupon IS NOT NULL);
    DECLARE @Carts INT = (SELECT COUNT(*) FROM dbo.Carts WHERE IDUser = @Ana);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @StillHeld;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Carts;   -- el carrito sigue, solo pierde el cupón
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test only an administrator can delete]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    DECLARE @Fixed INT = Test_CouponMaintenance.CouponId(N'FIXED10');
    EXEC dbo.SP_Coupons_Deactivate @IDActor = @Admin, @IDCoupon = @Fixed;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Coupons_Delete @IDActor = @Ana, @IDCoupon = @Fixed;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test deleting an unknown coupon says it was not found]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Coupon not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Coupons_Delete @IDActor = @Admin, @IDCoupon = -1;
END;
GO

CREATE PROCEDURE Test_CouponMaintenance.[test deleting needs the actor and the coupon]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%IDActor and IDCoupon are required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Coupons_Delete @IDActor = NULL, @IDCoupon = NULL;
END;
GO
