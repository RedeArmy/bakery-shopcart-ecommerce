/* =====================================================================
   Objeto   : Test_Dashboard (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Panel de métricas (RF-08): ventas por periodo, resumen, categorías, más vendidos y carritos abandonados
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). Las fechas de pago se fijan con un UPDATE directo
              porque el pago de las pruebas siempre ocurre el mismo día; los importes del ejemplo del diseño son A 145.00,
              B 45.00 y C 55.45.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Dashboard';
GO

CREATE PROCEDURE Test_Dashboard.SetUp
AS
BEGIN
    EXEC Test_Lifecycle.SetUp;
END;
GO

-- Ayudas ------------------------------------------------------------------------------------

-- Un pedido pagado de una variante con la fecha de pago indicada (UTC)
CREATE PROCEDURE Test_Dashboard.Sale
    @Email NVARCHAR(256), @SKU NVARCHAR(40), @Quantity INT, @Key NVARCHAR(64), @PaidAt DATETIME2(3), @To TINYINT, @IDOrder INT OUTPUT
AS
BEGIN
    DECLARE @IDPayment INT;
    EXEC Test_Lifecycle.Make @Email = @Email, @SKU = @SKU, @Quantity = @Quantity, @Key = @Key, @To = @To, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    UPDATE dbo.Orders SET PaidAt = @PaidAt WHERE IDOrder = @IDOrder;
END;
GO

-- Devuelve unidades de una línea de un pedido entregado
CREATE PROCEDURE Test_Dashboard.ReturnUnits
    @IDOrder INT, @SKU NVARCHAR(40), @Quantity INT
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Lines NVARCHAR(200), @IDReturn INT, @IDRefund INT, @Amount DECIMAL(18,2);
    SET @Lines = Test_Lifecycle.Lines(Test_Lifecycle.LineOf(@IDOrder, @SKU), @Quantity);
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Test return', @Lines = @Lines,
         @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;
END;
GO

CREATE PROCEDURE Test_Dashboard.SetCartActivity
    @Email NVARCHAR(256), @At DATETIME2(3)
AS
BEGIN
    UPDATE dbo.Carts SET LastActivityAt = @At WHERE IDUser = Test_Shop.UserId(@Email) AND Status = N'Active';
END;
GO

-- Vistas: qué cuenta como venta ---------------------------------------------------------------

CREATE PROCEDURE Test_Dashboard.[test only paid orders that are not cancelled count as a sale]
AS
BEGIN
    DECLARE @Paid INT, @Cancelled INT, @Pending INT, @PendingPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 2, @IDOrder = @Paid OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-06-01T15:00:00', @To = 2, @IDOrder = @Cancelled OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @Cancelled, @Reason = N'Changed my mind';
    EXEC Test_Lifecycle.Place @Email = N'luis@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 1, @Key = N'key-3', @Method = 2, @IDOrder = @Pending OUTPUT, @IDPayment = @PendingPayment OUTPUT;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.VW_Dashboard_SoldOrders);
    DECLARE @Only INT = (SELECT MIN(IDOrder) FROM dbo.VW_Dashboard_SoldOrders);
    DECLARE @Lines INT = (SELECT COUNT(*) FROM dbo.VW_Dashboard_SoldLines);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEquals @Expected = @Paid, @Actual = @Only;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Lines;
END;
GO

-- Ventas por periodo --------------------------------------------------------------------------

CREATE PROCEDURE Test_Dashboard.[test the daily series fills the days without sales with zeros]
AS
BEGIN
    DECLARE @A INT, @B INT, @C INT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 2, @IDOrder = @A OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-06-01T16:00:00', @To = 2, @IDOrder = @B OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 1, @Key = N'key-3', @PaidAt = '2030-06-03T15:00:00', @To = 2, @IDOrder = @C OUTPUT;

    CREATE TABLE #Series (PeriodStart DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25));
    INSERT INTO #Series EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-01', @To = '2030-06-04', @Granularity = 'day';

    DECLARE @Days INT = (SELECT COUNT(*) FROM #Series);
    DECLARE @FirstOrders INT = (SELECT Orders FROM #Series WHERE PeriodStart = '2030-06-01');
    DECLARE @FirstGross VARCHAR(25) = (SELECT Gross FROM #Series WHERE PeriodStart = '2030-06-01');
    DECLARE @FirstAverage VARCHAR(25) = (SELECT AverageTicket FROM #Series WHERE PeriodStart = '2030-06-01');
    DECLARE @EmptyOrders INT = (SELECT Orders FROM #Series WHERE PeriodStart = '2030-06-02');
    DECLARE @EmptyNet VARCHAR(25) = (SELECT Net FROM #Series WHERE PeriodStart = '2030-06-02');
    DECLARE @EmptyAverage VARCHAR(25) = (SELECT AverageTicket FROM #Series WHERE PeriodStart = '2030-06-02');
    DECLARE @ThirdNet VARCHAR(25) = (SELECT Net FROM #Series WHERE PeriodStart = '2030-06-03');
    DECLARE @LastOrders INT = (SELECT Orders FROM #Series WHERE PeriodStart = '2030-06-04');
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Days;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @FirstOrders;
    EXEC tSQLt.AssertEqualsString @Expected = N'190.00', @Actual = @FirstGross;
    EXEC tSQLt.AssertEqualsString @Expected = N'95.00', @Actual = @FirstAverage;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @EmptyOrders;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @EmptyNet;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @EmptyAverage;
    EXEC tSQLt.AssertEqualsString @Expected = N'55.45', @Actual = @ThirdNet;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @LastOrders;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the average ticket rounds half to even once]
AS
BEGIN
    DECLARE @A INT, @C INT;
    -- 145.00 + 55.45 = 200.45 entre dos pedidos = 100.225: empate exacto que baja al par (half-up daría 100.23)
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 2, @IDOrder = @A OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-06-01T16:00:00', @To = 2, @IDOrder = @C OUTPUT;

    CREATE TABLE #Series (PeriodStart DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25));
    INSERT INTO #Series EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-01', @To = '2030-06-01';
    DECLARE @Average VARCHAR(25) = (SELECT AverageTicket FROM #Series);
    EXEC tSQLt.AssertEqualsString @Expected = N'100.22', @Actual = @Average;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test returned units are subtracted from the sale]
AS
BEGIN
    DECLARE @IDOrder INT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 5, @IDOrder = @IDOrder OUTPUT;
    EXEC Test_Dashboard.ReturnUnits @IDOrder = @IDOrder, @SKU = N'C-CUPCAKE', @Quantity = 1;

    CREATE TABLE #Series (PeriodStart DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25));
    INSERT INTO #Series EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-01', @To = '2030-06-01';
    DECLARE @Gross VARCHAR(25) = (SELECT Gross FROM #Series), @Returned VARCHAR(25) = (SELECT Returned FROM #Series), @Net VARCHAR(25) = (SELECT Net FROM #Series);
    DECLARE @Orders INT = (SELECT Orders FROM #Series);
    EXEC tSQLt.AssertEqualsString @Expected = N'166.35', @Actual = @Gross;
    EXEC tSQLt.AssertEqualsString @Expected = N'55.45', @Actual = @Returned;
    EXEC tSQLt.AssertEqualsString @Expected = N'110.90', @Actual = @Net;
    -- Una devolución parcial no quita el pedido de las ventas
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Orders;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the day is the Guatemala day and not the UTC day]
AS
BEGIN
    DECLARE @Late INT, @Midnight INT;
    -- 05:30 UTC es las 23:30 del día anterior en Guatemala; 06:00 UTC es la medianoche local
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-02T05:30:00', @To = 2, @IDOrder = @Late OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-06-02T06:00:00', @To = 2, @IDOrder = @Midnight OUTPUT;

    CREATE TABLE #Series (PeriodStart DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25));
    INSERT INTO #Series EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-01', @To = '2030-06-02';
    DECLARE @FirstDay VARCHAR(25) = (SELECT Net FROM #Series WHERE PeriodStart = '2030-06-01');
    DECLARE @SecondDay VARCHAR(25) = (SELECT Net FROM #Series WHERE PeriodStart = '2030-06-02');
    EXEC tSQLt.AssertEqualsString @Expected = N'145.00', @Actual = @FirstDay;
    EXEC tSQLt.AssertEqualsString @Expected = N'45.00', @Actual = @SecondDay;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the weekly series starts its weeks on Monday]
AS
BEGIN
    DECLARE @Saturday INT, @Wednesday INT;
    -- 2030-06-01 es sábado (semana del lunes 05-27) y 2030-06-05 es miércoles (semana del lunes 06-03)
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 2, @IDOrder = @Saturday OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-06-05T15:00:00', @To = 2, @IDOrder = @Wednesday OUTPUT;

    CREATE TABLE #Series (PeriodStart DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25));
    INSERT INTO #Series EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-01', @To = '2030-06-05', @Granularity = 'week';
    DECLARE @Weeks INT = (SELECT COUNT(*) FROM #Series);
    DECLARE @First VARCHAR(10) = (SELECT CONVERT(VARCHAR(10), MIN(PeriodStart), 120) FROM #Series);
    DECLARE @Second VARCHAR(10) = (SELECT CONVERT(VARCHAR(10), MAX(PeriodStart), 120) FROM #Series);
    DECLARE @FirstNet VARCHAR(25) = (SELECT Net FROM #Series WHERE PeriodStart = '2030-05-27');
    DECLARE @SecondNet VARCHAR(25) = (SELECT Net FROM #Series WHERE PeriodStart = '2030-06-03');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Weeks;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-05-27', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-03', @Actual = @Second;
    EXEC tSQLt.AssertEqualsString @Expected = N'145.00', @Actual = @FirstNet;
    EXEC tSQLt.AssertEqualsString @Expected = N'45.00', @Actual = @SecondNet;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the monthly series groups by month and keeps the empty months]
AS
BEGIN
    DECLARE @June INT, @July INT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-30T15:00:00', @To = 2, @IDOrder = @June OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-07-01T15:00:00', @To = 2, @IDOrder = @July OUTPUT;

    CREATE TABLE #Series (PeriodStart DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25));
    INSERT INTO #Series EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-15', @To = '2030-08-10', @Granularity = 'month';
    DECLARE @Months INT = (SELECT COUNT(*) FROM #Series);
    DECLARE @JuneNet VARCHAR(25) = (SELECT Net FROM #Series WHERE PeriodStart = '2030-06-01');
    DECLARE @JulyNet VARCHAR(25) = (SELECT Net FROM #Series WHERE PeriodStart = '2030-07-01');
    DECLARE @AugustOrders INT = (SELECT Orders FROM #Series WHERE PeriodStart = '2030-08-01');
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Months;
    EXEC tSQLt.AssertEqualsString @Expected = N'145.00', @Actual = @JuneNet;
    EXEC tSQLt.AssertEqualsString @Expected = N'45.00', @Actual = @JulyNet;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @AugustOrders;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test a sale outside the range is not counted]
AS
BEGIN
    DECLARE @Inside INT, @Outside INT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-02T15:00:00', @To = 2, @IDOrder = @Inside OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-05-20T15:00:00', @To = 2, @IDOrder = @Outside OUTPUT;

    CREATE TABLE #Series (PeriodStart DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25));
    INSERT INTO #Series EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-01', @To = '2030-06-03';
    DECLARE @Total INT = (SELECT SUM(Orders) FROM #Series);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test without dates the series covers the last 30 days up to today in Guatemala]
AS
BEGIN
    CREATE TABLE #Series (PeriodStart DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25));
    -- 2030-06-10 03:00 UTC todavía es 06-09 en Guatemala
    INSERT INTO #Series EXEC dbo.SP_Dashboard_SalesByPeriod @Now = '2030-06-10T03:00:00';
    DECLARE @Days INT = (SELECT COUNT(*) FROM #Series);
    DECLARE @First VARCHAR(10) = (SELECT CONVERT(VARCHAR(10), MIN(PeriodStart), 120) FROM #Series);
    DECLARE @Last VARCHAR(10) = (SELECT CONVERT(VARCHAR(10), MAX(PeriodStart), 120) FROM #Series);
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @Days;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-05-11', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-09', @Actual = @Last;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the series refuses an invalid granularity, a reversed range and too many periods]
AS
BEGIN
    DECLARE @Failures INT = 0;
    BEGIN TRY EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-01', @To = '2030-06-02', @Granularity = 'hour'; END TRY
    BEGIN CATCH IF ERROR_NUMBER() = 50400 AND ERROR_MESSAGE() LIKE N'%day, week or month%' SET @Failures += 1; END CATCH;
    BEGIN TRY EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2030-06-05', @To = '2030-06-01'; END TRY
    BEGIN CATCH IF ERROR_NUMBER() = 50400 AND ERROR_MESSAGE() LIKE N'%not be after%' SET @Failures += 1; END CATCH;
    BEGIN TRY EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2025-01-01', @To = '2030-01-01', @Granularity = 'day'; END TRY
    BEGIN CATCH IF ERROR_NUMBER() = 50400 AND ERROR_MESSAGE() LIKE N'%more than 400 periods%' SET @Failures += 1; END CATCH;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Failures;
END;
GO

-- Resumen -------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Dashboard.[test the summary adds up the sales and counts what needs attention]
AS
BEGIN
    DECLARE @A INT, @B INT, @C INT, @Pending INT, @PendingPayment INT, @Review INT, @ReviewPayment INT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 2, @IDOrder = @A OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-2', @PaidAt = '2030-06-02T15:00:00', @To = 5, @IDOrder = @C OUTPUT;
    EXEC Test_Dashboard.ReturnUnits @IDOrder = @C, @SKU = N'C-CUPCAKE', @Quantity = 1;
    -- Un pedido esperando el pago y otro con el comprobante en revisión (los dos siguen pendientes de pago)
    EXEC Test_Lifecycle.Place @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-3', @Method = 2, @IDOrder = @Pending OUTPUT, @IDPayment = @PendingPayment OUTPUT;
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-4', @Method = 2, @IDOrder = @Review OUTPUT, @IDPayment = @ReviewPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'ana@shopcart.test', @IDPayment = @ReviewPayment, @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @Amount = 45.00;
    -- Un carrito con productos y sin actividad desde hace días
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'W-WEDDING', @Quantity = 1;
    EXEC Test_Dashboard.SetCartActivity @Email = N'ana@shopcart.test', @At = '2030-06-01T10:00:00';

    CREATE TABLE #Summary (FromDate DATE, ToDate DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25),
                           PendingPaymentOrders INT, DepositsUnderReview INT, AbandonedCarts INT);
    INSERT INTO #Summary EXEC dbo.SP_Dashboard_Summary @From = '2030-06-01', @To = '2030-06-05', @Now = '2030-06-10T12:00:00';

    DECLARE @Orders INT = (SELECT Orders FROM #Summary), @Gross VARCHAR(25) = (SELECT Gross FROM #Summary), @Returned VARCHAR(25) = (SELECT Returned FROM #Summary);
    DECLARE @Net VARCHAR(25) = (SELECT Net FROM #Summary), @Average VARCHAR(25) = (SELECT AverageTicket FROM #Summary);
    DECLARE @Waiting INT = (SELECT PendingPaymentOrders FROM #Summary), @UnderReview INT = (SELECT DepositsUnderReview FROM #Summary), @Abandoned INT = (SELECT AbandonedCarts FROM #Summary);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Orders;
    EXEC tSQLt.AssertEqualsString @Expected = N'311.35', @Actual = @Gross;
    EXEC tSQLt.AssertEqualsString @Expected = N'55.45', @Actual = @Returned;
    EXEC tSQLt.AssertEqualsString @Expected = N'255.90', @Actual = @Net;
    -- 255.90 entre 2 pedidos
    EXEC tSQLt.AssertEqualsString @Expected = N'127.95', @Actual = @Average;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Waiting;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @UnderReview;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Abandoned;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the summary of an empty period is all zeros and has no average]
AS
BEGIN
    CREATE TABLE #Summary (FromDate DATE, ToDate DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25),
                           PendingPaymentOrders INT, DepositsUnderReview INT, AbandonedCarts INT);
    INSERT INTO #Summary EXEC dbo.SP_Dashboard_Summary @From = '2030-06-01', @To = '2030-06-05';
    DECLARE @Orders INT = (SELECT Orders FROM #Summary), @Net VARCHAR(25) = (SELECT Net FROM #Summary), @Average VARCHAR(25) = (SELECT AverageTicket FROM #Summary);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Orders;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @Net;
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @Average;
END;
GO

-- Categorías y más vendidos -----------------------------------------------------------------------

CREATE PROCEDURE Test_Dashboard.[test the sales by category are net of returns, ordered by amount, and add up to the net sale]
AS
BEGIN
    DECLARE @A INT, @B INT, @C INT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 2, @IDOrder = @A OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-06-01T16:00:00', @To = 2, @IDOrder = @B OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-3', @PaidAt = '2030-06-02T15:00:00', @To = 5, @IDOrder = @C OUTPUT;
    EXEC Test_Dashboard.ReturnUnits @IDOrder = @C, @SKU = N'C-CUPCAKE', @Quantity = 1;

    CREATE TABLE #Categories (IDCategory INT, CategoryName NVARCHAR(80), Orders INT, Units INT, Net VARCHAR(25));
    INSERT INTO #Categories EXEC dbo.SP_Dashboard_SalesByCategory @From = '2030-06-01', @To = '2030-06-05';
    CREATE TABLE #Summary (FromDate DATE, ToDate DATE, Orders INT, Gross VARCHAR(25), Returned VARCHAR(25), Net VARCHAR(25), AverageTicket VARCHAR(25),
                           PendingPaymentOrders INT, DepositsUnderReview INT, AbandonedCarts INT);
    INSERT INTO #Summary EXEC dbo.SP_Dashboard_Summary @From = '2030-06-01', @To = '2030-06-05';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Categories);
    DECLARE @Leader NVARCHAR(80) = (SELECT TOP (1) CategoryName FROM #Categories ORDER BY CAST(Net AS DECIMAL(18,2)) DESC);
    DECLARE @CupcakeNet VARCHAR(25) = (SELECT Net FROM #Categories WHERE CategoryName = N'Cupcakes');
    DECLARE @CupcakeUnits INT = (SELECT Units FROM #Categories WHERE CategoryName = N'Cupcakes');
    DECLARE @CupcakeOrders INT = (SELECT Orders FROM #Categories WHERE CategoryName = N'Cupcakes');
    DECLARE @SumOfCategories DECIMAL(18,2) = (SELECT SUM(CAST(Net AS DECIMAL(18,2))) FROM #Categories);
    DECLARE @SummaryNet DECIMAL(18,2) = (SELECT CAST(Net AS DECIMAL(18,2)) FROM #Summary);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'Cakes', @Actual = @Leader;
    EXEC tSQLt.AssertEqualsString @Expected = N'110.90', @Actual = @CupcakeNet;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @CupcakeUnits;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @CupcakeOrders;
    -- Las categorías suman exactamente la venta neta del periodo
    EXEC tSQLt.AssertEquals @Expected = @SummaryNet, @Actual = @SumOfCategories;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the best sellers rank by units then by amount and respect the limit]
AS
BEGIN
    DECLARE @A INT, @B INT, @C INT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 2, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 2, @IDOrder = @A OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @PaidAt = '2030-06-01T16:00:00', @To = 2, @IDOrder = @B OUTPUT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-3', @PaidAt = '2030-06-02T15:00:00', @To = 5, @IDOrder = @C OUTPUT;
    EXEC Test_Dashboard.ReturnUnits @IDOrder = @C, @SKU = N'C-CUPCAKE', @Quantity = 1;

    CREATE TABLE #Top (Position INT, IDProduct INT, ProductName NVARCHAR(150), Units INT, Net VARCHAR(25));
    CREATE TABLE #TopTwo (Position INT, IDProduct INT, ProductName NVARCHAR(150), Units INT, Net VARCHAR(25));
    INSERT INTO #Top EXEC dbo.SP_Dashboard_TopProducts @From = '2030-06-01', @To = '2030-06-05';
    INSERT INTO #TopTwo EXEC dbo.SP_Dashboard_TopProducts @From = '2030-06-01', @To = '2030-06-05', @Top = 2;

    -- Milk cake y Velvet cupcakes empatan en 2 unidades (3 vendidas, 1 devuelta): gana el de más venta neta
    DECLARE @First NVARCHAR(150) = (SELECT ProductName FROM #Top WHERE Position = 1), @Second NVARCHAR(150) = (SELECT ProductName FROM #Top WHERE Position = 2);
    DECLARE @Third NVARCHAR(150) = (SELECT ProductName FROM #Top WHERE Position = 3), @FirstNet VARCHAR(25) = (SELECT Net FROM #Top WHERE Position = 1);
    DECLARE @SecondUnits INT = (SELECT Units FROM #Top WHERE Position = 2), @Limited INT = (SELECT COUNT(*) FROM #TopTwo);
    EXEC tSQLt.AssertEqualsString @Expected = N'Milk cake', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = N'290.00', @Actual = @FirstNet;
    EXEC tSQLt.AssertEqualsString @Expected = N'Velvet cupcakes', @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @SecondUnits;
    EXEC tSQLt.AssertEqualsString @Expected = N'Oat cookies', @Actual = @Third;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Limited;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test a product with every unit returned is not a best seller]
AS
BEGIN
    DECLARE @IDOrder INT;
    EXEC Test_Dashboard.Sale @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 1, @Key = N'key-1', @PaidAt = '2030-06-01T15:00:00', @To = 5, @IDOrder = @IDOrder OUTPUT;
    EXEC Test_Dashboard.ReturnUnits @IDOrder = @IDOrder, @SKU = N'C-CUPCAKE', @Quantity = 1;

    CREATE TABLE #Top (Position INT, IDProduct INT, ProductName NVARCHAR(150), Units INT, Net VARCHAR(25));
    INSERT INTO #Top EXEC dbo.SP_Dashboard_TopProducts @From = '2030-06-01', @To = '2030-06-05';
    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Top);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the best sellers refuse a limit outside 1 to 50]
AS
BEGIN
    DECLARE @Failures INT = 0;
    BEGIN TRY EXEC dbo.SP_Dashboard_TopProducts @Top = 0; END TRY
    BEGIN CATCH IF ERROR_NUMBER() = 50400 SET @Failures += 1; END CATCH;
    BEGIN TRY EXEC dbo.SP_Dashboard_TopProducts @Top = 51; END TRY
    BEGIN CATCH IF ERROR_NUMBER() = 50400 SET @Failures += 1; END CATCH;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Failures;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the reports refuse a reversed range]
AS
BEGIN
    DECLARE @Failures INT = 0;
    BEGIN TRY EXEC dbo.SP_Dashboard_SalesByCategory @From = '2030-06-05', @To = '2030-06-01'; END TRY
    BEGIN CATCH IF ERROR_NUMBER() = 50400 SET @Failures += 1; END CATCH;
    BEGIN TRY EXEC dbo.SP_Dashboard_Summary @From = '2030-06-05', @To = '2030-06-01'; END TRY
    BEGIN CATCH IF ERROR_NUMBER() = 50400 SET @Failures += 1; END CATCH;
    BEGIN TRY EXEC dbo.SP_Dashboard_TopProducts @From = '2030-06-05', @To = '2030-06-01'; END TRY
    BEGIN CATCH IF ERROR_NUMBER() = 50400 SET @Failures += 1; END CATCH;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Failures;
END;
GO

-- Carritos abandonados ------------------------------------------------------------------------

CREATE PROCEDURE Test_Dashboard.[test only carts with products and a long inactivity are abandoned]
AS
BEGIN
    -- Ana: dos productos, parada desde hace días. Luis: un producto, actividad reciente. Un visitante sin cuenta no entra al panel aquí.
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 2;
    EXEC Test_Dashboard.SetCartActivity @Email = N'ana@shopcart.test', @At = '2030-06-01T10:00:00';
    EXEC Test_Orders.AddLine @Email = N'luis@shopcart.test', @SKU = N'W-WEDDING', @Quantity = 1;
    EXEC Test_Dashboard.SetCartActivity @Email = N'luis@shopcart.test', @At = '2030-06-10T06:00:00';

    CREATE TABLE #Carts (IDCart INT, IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), ItemCount INT, Estimated VARCHAR(25),
                         LastActivityAt DATETIME2(3), IdleHours INT, TotalCount INT);
    INSERT INTO #Carts EXEC dbo.SP_Dashboard_AbandonedCarts @Now = '2030-06-10T12:00:00';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Carts), @Email NVARCHAR(256) = (SELECT CustomerEmail FROM #Carts);
    DECLARE @Items INT = (SELECT ItemCount FROM #Carts), @Estimated VARCHAR(25) = (SELECT Estimated FROM #Carts), @Idle INT = (SELECT IdleHours FROM #Carts);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'ana@shopcart.test', @Actual = @Email;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Items;
    -- 145.00 + 2 x 45.00
    EXEC tSQLt.AssertEqualsString @Expected = N'235.00', @Actual = @Estimated;
    -- Del 1 de junio a las 10:00 al 10 a las 12:00 son 218 horas
    EXEC tSQLt.AssertEquals @Expected = 218, @Actual = @Idle;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test a cart with no products and a converted cart are never abandoned]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    -- Un carrito vacío (se agregó y se quitó) y otro que ya se convirtió en pedido
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    DELETE FROM dbo.CartItems WHERE IDCart IN (SELECT IDCart FROM dbo.Carts WHERE IDUser = Test_Shop.UserId(N'ana@shopcart.test'));
    EXEC Test_Dashboard.SetCartActivity @Email = N'ana@shopcart.test', @At = '2030-06-01T10:00:00';
    EXEC Test_Lifecycle.Place @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    UPDATE dbo.Carts SET LastActivityAt = '2030-06-01T10:00:00' WHERE IDUser = Test_Shop.UserId(N'luis@shopcart.test');

    CREATE TABLE #Carts (IDCart INT, IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), ItemCount INT, Estimated VARCHAR(25),
                         LastActivityAt DATETIME2(3), IdleHours INT, TotalCount INT);
    INSERT INTO #Carts EXEC dbo.SP_Dashboard_AbandonedCarts @Now = '2030-06-10T12:00:00';
    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Carts);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the abandonment threshold comes from the configuration]
AS
BEGIN
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Dashboard.SetCartActivity @Email = N'ana@shopcart.test', @At = '2030-06-09T06:00:00';
    CREATE TABLE #Carts (IDCart INT, IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), ItemCount INT, Estimated VARCHAR(25),
                         LastActivityAt DATETIME2(3), IdleHours INT, TotalCount INT);

    -- 30 horas de inactividad: abandonado con el umbral de 24 horas, todavía no con uno de 48
    IF EXISTS (SELECT 1 FROM dbo.Configuration WHERE SettingKey = N'AbandonedCartHours') UPDATE dbo.Configuration SET SettingValue = N'24' WHERE SettingKey = N'AbandonedCartHours';
    ELSE INSERT INTO dbo.Configuration (SettingKey, SettingValue) VALUES (N'AbandonedCartHours', N'24');
    INSERT INTO #Carts EXEC dbo.SP_Dashboard_AbandonedCarts @Now = '2030-06-10T12:00:00';
    DECLARE @WithDefault INT = (SELECT COUNT(*) FROM #Carts);
    DELETE FROM #Carts;

    UPDATE dbo.Configuration SET SettingValue = N'48' WHERE SettingKey = N'AbandonedCartHours';
    INSERT INTO #Carts EXEC dbo.SP_Dashboard_AbandonedCarts @Now = '2030-06-10T12:00:00';
    DECLARE @WithLonger INT = (SELECT COUNT(*) FROM #Carts);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @WithDefault;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @WithLonger;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the abandoned carts list the most valuable first and page with a total]
AS
BEGIN
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;
    EXEC Test_Dashboard.SetCartActivity @Email = N'ana@shopcart.test', @At = '2030-06-01T10:00:00';
    EXEC Test_Orders.AddLine @Email = N'luis@shopcart.test', @SKU = N'W-WEDDING', @Quantity = 1;
    EXEC Test_Dashboard.SetCartActivity @Email = N'luis@shopcart.test', @At = '2030-06-02T10:00:00';

    CREATE TABLE #First (IDCart INT, IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), ItemCount INT, Estimated VARCHAR(25),
                         LastActivityAt DATETIME2(3), IdleHours INT, TotalCount INT);
    SELECT * INTO #Second FROM #First;
    INSERT INTO #First EXEC dbo.SP_Dashboard_AbandonedCarts @Now = '2030-06-10T12:00:00', @PageNumber = 1, @PageSize = 1;
    INSERT INTO #Second EXEC dbo.SP_Dashboard_AbandonedCarts @Now = '2030-06-10T12:00:00', @PageNumber = 2, @PageSize = 1;

    DECLARE @FirstEmail NVARCHAR(256) = (SELECT CustomerEmail FROM #First), @SecondEmail NVARCHAR(256) = (SELECT CustomerEmail FROM #Second);
    DECLARE @Total INT = (SELECT TotalCount FROM #First);
    EXEC tSQLt.AssertEqualsString @Expected = N'luis@shopcart.test', @Actual = @FirstEmail;
    EXEC tSQLt.AssertEqualsString @Expected = N'ana@shopcart.test', @Actual = @SecondEmail;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test a visitor cart appears without a name or an email]
AS
BEGIN
    DECLARE @IDCart INT;
    INSERT INTO dbo.Carts (GuestToken, Status, LastActivityAt) VALUES (NEWID(), N'Active', '2030-06-01T10:00:00');
    SET @IDCart = SCOPE_IDENTITY();
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity) VALUES (@IDCart, Test_Shop.VariantId(N'B-COOKIE'), 1);

    CREATE TABLE #Carts (IDCart INT, IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), ItemCount INT, Estimated VARCHAR(25),
                         LastActivityAt DATETIME2(3), IdleHours INT, TotalCount INT);
    INSERT INTO #Carts EXEC dbo.SP_Dashboard_AbandonedCarts @Now = '2030-06-10T12:00:00';
    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Carts WHERE IDCart = @IDCart AND IDUser IS NULL AND CustomerEmail IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Dashboard.[test the abandoned carts refuse an invalid page size]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%PageSize between 1 and 100%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Dashboard_AbandonedCarts @PageSize = 101;
END;
GO
