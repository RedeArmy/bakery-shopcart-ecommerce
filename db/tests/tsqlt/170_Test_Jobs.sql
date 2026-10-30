/* =====================================================================
   Objeto   : Test_Jobs (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Procedimientos de los jobs: vencimiento, purga y conciliación, y el bloqueo de ejecución única
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). Que otra instancia ya esté ejecutando el job (Skipped)
              no se puede probar aquí, porque tSQLt usa una sola sesión y el bloqueo es reentrante para ella: lo cubre
              npm run sql:concurrency con dos conexiones.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Jobs';
GO

CREATE PROCEDURE Test_Jobs.SetUp
AS
BEGIN
    EXEC Test_Lifecycle.SetUp;
END;
GO

-- Vencimiento --------------------------------------------------------------------------------

CREATE PROCEDURE Test_Jobs.[test the expiry job cancels the order whose payment elapsed and releases the cart reservation without an order]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(10), @Expired INT, @Released INT;
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    -- Un carrito que reservó y nunca confirmó (vence a los 15 minutos)
    EXEC Test_Orders.AddLine @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 2;
    DECLARE @IDReservation INT;
    EXEC Test_Orders.Reserve @Email = N'luis@shopcart.test', @IDReservation = @IDReservation OUTPUT;

    EXEC dbo.SP_Jobs_ExpirePayments @Now = '2030-06-03T00:00:00', @Outcome = @Outcome OUTPUT, @ExpiredOrders = @Expired OUTPUT, @ReleasedReservations = @Released OUTPUT;

    DECLARE @OrderStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @CartReservation NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDReservation = @IDReservation);
    DECLARE @Reserved INT = (SELECT SUM(ReservedStock) FROM dbo.Variants WHERE SKU IN (N'A-CAKE', N'B-COOKIE'));
    EXEC tSQLt.AssertEqualsString @Expected = N'Ran', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Expired;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Released;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @OrderStatus;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'Expired', @Actual = @CartReservation;
    -- Todo lo reservado volvió al stock disponible
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Reserved;
END;
GO

CREATE PROCEDURE Test_Jobs.[test the expiry job leaves alone what has not elapsed and a deposit under review]
AS
BEGIN
    DECLARE @Waiting INT, @WaitingPayment INT, @Review INT, @ReviewPayment INT, @Outcome VARCHAR(10), @Expired INT, @Released INT;
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @Waiting OUTPUT, @IDPayment = @WaitingPayment OUTPUT;
    EXEC Test_Lifecycle.Place @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @Method = 2, @IDOrder = @Review OUTPUT, @IDPayment = @ReviewPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = N'luis@shopcart.test', @IDPayment = @ReviewPayment, @Hash = '0000000000000000000000000000000000000000000000000000000000000009', @Reference = N'REF-9', @Amount = 45.00;

    -- Antes del plazo del primero (06-02 12:05); el segundo ya subió su comprobante y lo resuelve un operador, no el reloj
    EXEC dbo.SP_Jobs_ExpirePayments @Now = '2030-06-02T12:00:00', @Outcome = @Outcome OUTPUT, @ExpiredOrders = @Expired OUTPUT, @ReleasedReservations = @Released OUTPUT;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Expired;

    EXEC dbo.SP_Jobs_ExpirePayments @Now = '2030-06-10T00:00:00', @Outcome = @Outcome OUTPUT, @ExpiredOrders = @Expired OUTPUT, @ReleasedReservations = @Released OUTPUT;
    DECLARE @WaitingStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @Waiting);
    DECLARE @ReviewStatus INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @Review);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Expired;
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @WaitingStatus;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @ReviewStatus;
END;
GO

CREATE PROCEDURE Test_Jobs.[test a run with nothing to do reports Ran with zero counts]
AS
BEGIN
    DECLARE @Outcome VARCHAR(10), @Expired INT, @Released INT;
    EXEC dbo.SP_Jobs_ExpirePayments @Now = '2030-06-03T00:00:00', @Outcome = @Outcome OUTPUT, @ExpiredOrders = @Expired OUTPUT, @ReleasedReservations = @Released OUTPUT;
    EXEC tSQLt.AssertEqualsString @Expected = N'Ran', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Expired;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Released;
END;
GO

CREATE PROCEDURE Test_Jobs.[test the lock is released after a successful run]
AS
BEGIN
    DECLARE @Outcome VARCHAR(10);
    EXEC dbo.SP_Jobs_ExpirePayments @Outcome = @Outcome OUTPUT;
    DECLARE @Mode NVARCHAR(32) = APPLOCK_MODE(N'public', N'Job:ExpirePayments', N'Session');
    EXEC tSQLt.AssertEqualsString @Expected = N'NoLock', @Actual = @Mode;
END;
GO

CREATE PROCEDURE Test_Jobs.[test the lock is released when the job fails]
AS
BEGIN
    DECLARE @Message NVARCHAR(400) = N'', @Outcome VARCHAR(10);
    BEGIN TRY
        -- Un lote inválido hace fallar ExpirePending después de tomar el bloqueo
        EXEC dbo.SP_Jobs_ExpirePayments @BatchSize = 0, @Outcome = @Outcome OUTPUT;
    END TRY
    BEGIN CATCH
        SET @Message = ERROR_MESSAGE();
    END CATCH;

    DECLARE @Mode NVARCHAR(32) = APPLOCK_MODE(N'public', N'Job:ExpirePayments', N'Session');
    DECLARE @Failed INT = CASE WHEN @Message LIKE N'%BatchSize%' THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Failed;
    EXEC tSQLt.AssertEqualsString @Expected = N'NoLock', @Actual = @Mode;
END;
GO

-- Purga --------------------------------------------------------------------------------------

CREATE PROCEDURE Test_Jobs.[test the purge job deletes the idempotency keys that expired and keeps the others]
AS
BEGIN
    CREATE TABLE #Begun (Outcome VARCHAR(12), HttpStatus SMALLINT, ResponseBody NVARCHAR(MAX), RetryAfterSeconds INT);
    -- Una llave de hace años (vence al día siguiente) y otra reciente
    INSERT INTO #Begun EXEC dbo.SP_Idempotency_Begin @Scope = N'U:1', @Method = N'POST', @Route = N'/old', @IdempotencyKey = N'old-key-0001', @RequestHash = '0000000000000000000000000000000000000000000000000000000000000001', @Now = '2000-01-01T00:00:00';
    INSERT INTO #Begun EXEC dbo.SP_Idempotency_Begin @Scope = N'U:1', @Method = N'POST', @Route = N'/new', @IdempotencyKey = N'new-key-0001', @RequestHash = '0000000000000000000000000000000000000000000000000000000000000002', @Now = '2030-01-01T00:00:00';

    DECLARE @Outcome VARCHAR(10), @Purged INT;
    EXEC dbo.SP_Jobs_PurgeExpired @Now = '2030-01-01T12:00:00', @Outcome = @Outcome OUTPUT, @PurgedIdempotency = @Purged OUTPUT;

    DECLARE @Left INT = (SELECT COUNT(*) FROM dbo.IdempotentRequests WHERE IdempotencyKey IN (N'old-key-0001', N'new-key-0001'));
    EXEC tSQLt.AssertEqualsString @Expected = N'Ran', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Purged;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Left;
    DECLARE @Mode NVARCHAR(32) = APPLOCK_MODE(N'public', N'Job:PurgeExpired', N'Session');
    EXEC tSQLt.AssertEqualsString @Expected = N'NoLock', @Actual = @Mode;
END;
GO

-- Conciliación -------------------------------------------------------------------------------

CREATE PROCEDURE Test_Jobs.[test the reconciliation job writes nothing when everything balances]
AS
BEGIN
    -- Sin variantes ni pedidos no hay nada que descuadre (las existencias de las pruebas no pasan por el libro)
    EXEC tSQLt.FakeTable @TableName = N'dbo.Variants';
    DECLARE @Outcome VARCHAR(10), @Amounts INT, @Inventory INT;
    EXEC dbo.SP_Jobs_ReconcileAmounts @Now = '2030-06-01T00:00:00', @Outcome = @Outcome OUTPUT, @AmountDiscrepancies = @Amounts OUTPUT, @InventoryDiscrepancies = @Inventory OUTPUT;

    DECLARE @Audited INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Reconciliation');
    EXEC tSQLt.AssertEqualsString @Expected = N'Ran', @Actual = @Outcome;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Amounts;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Inventory;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Audited;
END;
GO

CREATE PROCEDURE Test_Jobs.[test the reconciliation job audits a money discrepancy with a sample of the rows]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Outcome VARCHAR(10), @Amounts INT, @Inventory INT;
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    -- Un reembolso mayor que lo cobrado: el control "RefundsExceedPayment" lo detecta
    INSERT INTO dbo.Refunds (IDPayment, Amount, Reason, Status) VALUES (@IDPayment, 999.00, N'Tampered', N'Pending');

    EXEC dbo.SP_Jobs_ReconcileAmounts @Now = '2030-06-01T00:00:00', @Outcome = @Outcome OUTPUT, @AmountDiscrepancies = @Amounts OUTPUT, @InventoryDiscrepancies = @Inventory OUTPUT;

    DECLARE @Entry NVARCHAR(MAX) = (SELECT TOP (1) NewValue FROM dbo.AuditLog WHERE Module = N'Reconciliation');
    DECLARE @Valid INT = ISJSON(@Entry);
    DECLARE @Counted INT = CAST(JSON_VALUE(@Entry, '$.amounts') AS INT);
    DECLARE @First NVARCHAR(40) = JSON_VALUE(@Entry, '$.amountRows[0].check');
    DECLARE @Positive INT = CASE WHEN @Amounts >= 1 THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Positive;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Valid;
    EXEC tSQLt.AssertEquals @Expected = @Amounts, @Actual = @Counted;
    EXEC tSQLt.AssertEqualsString @Expected = N'RefundsExceedPayment', @Actual = @First;
END;
GO

CREATE PROCEDURE Test_Jobs.[test the reconciliation job counts the inventory that does not match its ledger]
AS
BEGIN
    DECLARE @Outcome VARCHAR(10), @Amounts INT, @Inventory INT;
    -- Las variantes de prueba tienen existencias sin movimientos en el libro
    EXEC dbo.SP_Jobs_ReconcileAmounts @Now = '2030-06-01T00:00:00', @Outcome = @Outcome OUTPUT, @AmountDiscrepancies = @Amounts OUTPUT, @InventoryDiscrepancies = @Inventory OUTPUT;
    DECLARE @Expected INT = (SELECT COUNT(*) FROM dbo.VW_Inventory_Reconciliation);
    DECLARE @Audited INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Reconciliation');
    EXEC tSQLt.AssertEquals @Expected = @Expected, @Actual = @Inventory;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Audited;
END;
GO

CREATE PROCEDURE Test_Jobs.[test the reconciliation list shows both sources and honours its limit]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    INSERT INTO dbo.Refunds (IDPayment, Amount, Reason, Status) VALUES (@IDPayment, 999.00, N'Tampered', N'Pending');

    CREATE TABLE #All (Source NVARCHAR(10), [Check] NVARCHAR(30), EntityKey NVARCHAR(40), Expected VARCHAR(25), Actual VARCHAR(25));
    SELECT * INTO #Few FROM #All;
    INSERT INTO #All EXEC dbo.SP_Reconciliation_List;
    INSERT INTO #Few EXEC dbo.SP_Reconciliation_List @Limit = 2;

    DECLARE @Sources INT = (SELECT COUNT(DISTINCT Source) FROM #All), @FewRows INT = (SELECT COUNT(*) FROM #Few);
    DECLARE @FirstSource NVARCHAR(10) = (SELECT TOP (1) Source FROM #All ORDER BY Source, [Check], EntityKey);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Sources;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @FewRows;
    EXEC tSQLt.AssertEqualsString @Expected = N'Amounts', @Actual = @FirstSource;
END;
GO

CREATE PROCEDURE Test_Jobs.[test the reconciliation list refuses a limit outside the range]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Limit must be between%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Reconciliation_List @Limit = 501;
END;
GO
