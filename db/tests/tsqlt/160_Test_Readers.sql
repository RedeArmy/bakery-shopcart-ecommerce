/* =====================================================================
   Objeto   : Test_Readers (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Consultas del pedido y del pago, cola de depósitos, cuentas bancarias, auditoría y versiones de objetos
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023).
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Readers';
GO

CREATE PROCEDURE Test_Readers.SetUp
AS
BEGIN
    EXEC Test_Lifecycle.SetUp;
END;
GO

-- Ayudas ------------------------------------------------------------------------------------

-- Pedido de depósito de una unidad de A-CAKE (145.00) con comprobante registrado: el pago queda en revisión
CREATE PROCEDURE Test_Readers.UnderReview
    @Email NVARCHAR(256), @Key NVARCHAR(64), @Hash CHAR(64), @Reference NVARCHAR(40), @IDOrder INT OUTPUT, @IDPayment INT OUTPUT
AS
BEGIN
    EXEC Test_Lifecycle.Place @Email = @Email, @SKU = N'A-CAKE', @Quantity = 1, @Key = @Key, @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Payments.Proof @Email = @Email, @IDPayment = @IDPayment, @Hash = @Hash, @Reference = @Reference, @Amount = 145.00;
END;
GO

CREATE FUNCTION Test_Readers.ProofOf (@IDPayment INT) RETURNS INT
AS
BEGIN
    RETURN (SELECT TOP (1) IDPaymentProof FROM dbo.PaymentProofs WHERE IDPayment = @IDPayment ORDER BY IDPaymentProof);
END;
GO

-- Lista de pedidos ---------------------------------------------------------------------------

CREATE PROCEDURE Test_Readers.[test a customer lists only their own orders]
AS
BEGIN
    DECLARE @AnaOrder INT, @AnaPayment INT, @LuisOrder INT, @LuisPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @AnaOrder OUTPUT, @IDPayment = @AnaPayment OUTPUT;
    EXEC Test_Lifecycle.Place @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @Method = 2, @IDOrder = @LuisOrder OUTPUT, @IDPayment = @LuisPayment OUTPUT;

    CREATE TABLE #Result (IDOrder INT, OrderNumber NVARCHAR(20), IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), IDOrderStatus TINYINT,
                          StatusName NVARCHAR(30), Total VARCHAR(25), ItemCount INT, CreatedAt DATETIME2(3), PaidAt DATETIME2(3), RequestedDeliveryDate DATE, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Orders_List @IDActor = @Ana;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result), @Only INT = (SELECT MIN(IDOrder) FROM #Result), @Total VARCHAR(25) = (SELECT Total FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEquals @Expected = @AnaOrder, @Actual = @Only;
    EXEC tSQLt.AssertEqualsString @Expected = N'145.00', @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Readers.[test a customer cannot widen the list by passing the staff flag with a search for another order]
AS
BEGIN
    DECLARE @AnaOrder INT, @AnaPayment INT, @LuisOrder INT, @LuisPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @AnaOrder OUTPUT, @IDPayment = @AnaPayment OUTPUT;
    EXEC Test_Lifecycle.Place @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @Method = 2, @IDOrder = @LuisOrder OUTPUT, @IDPayment = @LuisPayment OUTPUT;
    DECLARE @LuisNumber NVARCHAR(20) = (SELECT OrderNumber FROM dbo.Orders WHERE IDOrder = @LuisOrder);

    CREATE TABLE #Result (IDOrder INT, OrderNumber NVARCHAR(20), IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), IDOrderStatus TINYINT,
                          StatusName NVARCHAR(30), Total VARCHAR(25), ItemCount INT, CreatedAt DATETIME2(3), PaidAt DATETIME2(3), RequestedDeliveryDate DATE, TotalCount INT);
    -- La búsqueda por número es del personal: un cliente que la pide no recibe nada, ni siquiera el pedido ajeno
    INSERT INTO #Result EXEC dbo.SP_Orders_List @IDActor = @Ana, @Search = @LuisNumber;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Readers.[test staff lists every order and can filter by status and search by number or email]
AS
BEGIN
    DECLARE @AnaOrder INT, @AnaPayment INT, @LuisOrder INT, @LuisPayment INT, @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @AnaOrder OUTPUT, @IDPayment = @AnaPayment OUTPUT;
    EXEC Test_Lifecycle.Make @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @To = 2, @IDOrder = @LuisOrder OUTPUT, @IDPayment = @LuisPayment OUTPUT;
    DECLARE @LuisNumber NVARCHAR(20) = (SELECT OrderNumber FROM dbo.Orders WHERE IDOrder = @LuisOrder);

    CREATE TABLE #All (IDOrder INT, OrderNumber NVARCHAR(20), IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), IDOrderStatus TINYINT,
                       StatusName NVARCHAR(30), Total VARCHAR(25), ItemCount INT, CreatedAt DATETIME2(3), PaidAt DATETIME2(3), RequestedDeliveryDate DATE, TotalCount INT);
    SELECT * INTO #Paid FROM #All; SELECT * INTO #ByNumber FROM #All; SELECT * INTO #ByEmail FROM #All;
    INSERT INTO #All EXEC dbo.SP_Orders_List @IDActor = @Admin, @AsStaff = 1;
    INSERT INTO #Paid EXEC dbo.SP_Orders_List @IDActor = @Admin, @AsStaff = 1, @IDOrderStatus = 2;
    INSERT INTO #ByNumber EXEC dbo.SP_Orders_List @IDActor = @Admin, @AsStaff = 1, @Search = @LuisNumber;
    INSERT INTO #ByEmail EXEC dbo.SP_Orders_List @IDActor = @Admin, @AsStaff = 1, @Search = N'ana@';

    DECLARE @AllRows INT = (SELECT COUNT(*) FROM #All), @PaidRows INT = (SELECT COUNT(*) FROM #Paid);
    DECLARE @NumberOrder INT = (SELECT IDOrder FROM #ByNumber), @EmailOrder INT = (SELECT IDOrder FROM #ByEmail);
    DECLARE @Total INT = (SELECT MAX(TotalCount) FROM #All);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @AllRows;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PaidRows;
    EXEC tSQLt.AssertEquals @Expected = @LuisOrder, @Actual = @NumberOrder;
    EXEC tSQLt.AssertEquals @Expected = @AnaOrder, @Actual = @EmailOrder;
END;
GO

CREATE PROCEDURE Test_Readers.[test the order list is paged and reports the total]
AS
BEGIN
    DECLARE @First INT, @FirstPayment INT, @Second INT, @SecondPayment INT, @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @First OUTPUT, @IDPayment = @FirstPayment OUTPUT;
    EXEC Test_Lifecycle.Place @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @Method = 2, @IDOrder = @Second OUTPUT, @IDPayment = @SecondPayment OUTPUT;

    CREATE TABLE #Result (IDOrder INT, OrderNumber NVARCHAR(20), IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), IDOrderStatus TINYINT,
                          StatusName NVARCHAR(30), Total VARCHAR(25), ItemCount INT, CreatedAt DATETIME2(3), PaidAt DATETIME2(3), RequestedDeliveryDate DATE, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Orders_List @IDActor = @Admin, @AsStaff = 1, @PageNumber = 2, @PageSize = 1;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result), @Id INT = (SELECT IDOrder FROM #Result), @Total INT = (SELECT TotalCount FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    -- Del más nuevo al más antiguo: la segunda página es el primer pedido
    EXEC tSQLt.AssertEquals @Expected = @First, @Actual = @Id;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Readers.[test the order list refuses an invalid page size]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%PageSize between 1 and 100%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_List @IDActor = 1, @PageSize = 101;
END;
GO

-- Detalle del pedido -------------------------------------------------------------------------

CREATE PROCEDURE Test_Readers.[test the owner reads the order with its lines and its history]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 3, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    CREATE TABLE #Result (IDOrder INT, OrderNumber NVARCHAR(20), IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), IDOrderStatus TINYINT,
                          StatusName NVARCHAR(30), CouponCode NVARCHAR(30), DeliveryRecipient NVARCHAR(120), DeliveryPhone NVARCHAR(20), DeliveryLine1 NVARCHAR(200),
                          DeliveryMunicipality NVARCHAR(80), DeliveryDepartment NVARCHAR(80), RequestedDeliveryDate DATE, Subtotal VARCHAR(25), Discount VARCHAR(25),
                          Shipping VARCHAR(25), Total VARCHAR(25), TaxableBase VARCHAR(25), Vat VARCHAR(25), CreatedAt DATETIME2(3), PaidAt DATETIME2(3),
                          Lines NVARCHAR(MAX), History NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Orders_GetDetail @IDActor = @Ana, @IDOrder = @IDOrder;

    DECLARE @Status NVARCHAR(30) = (SELECT StatusName FROM #Result), @Total VARCHAR(25) = (SELECT Total FROM #Result);
    DECLARE @Lines NVARCHAR(MAX) = (SELECT Lines FROM #Result), @History NVARCHAR(MAX) = (SELECT History FROM #Result);
    DECLARE @LineCount INT = (SELECT COUNT(*) FROM OPENJSON(@Lines));
    DECLARE @LineTotal VARCHAR(25) = (SELECT JSON_VALUE(@Lines, '$[0].LineTotal'));
    DECLARE @HistoryCount INT = (SELECT COUNT(*) FROM OPENJSON(@History));
    EXEC tSQLt.AssertEqualsString @Expected = N'InPreparation', @Actual = @Status;
    EXEC tSQLt.AssertEqualsString @Expected = N'166.35', @Actual = @Total;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @LineCount;
    EXEC tSQLt.AssertEqualsString @Expected = N'166.35', @Actual = @LineTotal;
    -- Creado, pagado y en preparación
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @HistoryCount;
END;
GO

CREATE PROCEDURE Test_Readers.[test another customer reading the order is told it does not exist]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Order not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_GetDetail @IDActor = @Luis, @IDOrder = @IDOrder;
END;
GO

CREATE PROCEDURE Test_Readers.[test staff can read any order]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    CREATE TABLE #Result (IDOrder INT, OrderNumber NVARCHAR(20), IDUser INT, CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), IDOrderStatus TINYINT,
                          StatusName NVARCHAR(30), CouponCode NVARCHAR(30), DeliveryRecipient NVARCHAR(120), DeliveryPhone NVARCHAR(20), DeliveryLine1 NVARCHAR(200),
                          DeliveryMunicipality NVARCHAR(80), DeliveryDepartment NVARCHAR(80), RequestedDeliveryDate DATE, Subtotal VARCHAR(25), Discount VARCHAR(25),
                          Shipping VARCHAR(25), Total VARCHAR(25), TaxableBase VARCHAR(25), Vat VARCHAR(25), CreatedAt DATETIME2(3), PaidAt DATETIME2(3),
                          Lines NVARCHAR(MAX), History NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Orders_GetDetail @IDActor = @Admin, @AsStaff = 1, @IDOrder = @IDOrder;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Readers.[test reading an unknown order answers not found]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Order not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_GetDetail @IDActor = 1, @AsStaff = 1, @IDOrder = -1;
END;
GO

-- Pagos del pedido y comprobantes -------------------------------------------------------------

CREATE PROCEDURE Test_Readers.[test the payment view shows the bank, the deposit data and the proofs]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Readers.UnderReview @Email = N'ana@shopcart.test', @Key = N'key-1', @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    CREATE TABLE #Result (IDPayment INT, IDPaymentMethod TINYINT, MethodCode NVARCHAR(30), IDPaymentStatus TINYINT, StatusName NVARCHAR(30), Amount VARCHAR(25),
                          ExpiresAt DATETIME2(3), CreatedAt DATETIME2(3), ResolvedAt DATETIME2(3), IDBankAccount INT, BankName NVARCHAR(80), AccountType NVARCHAR(12),
                          AccountNumber NVARCHAR(30), HolderName NVARCHAR(120), Instructions NVARCHAR(300), ReferenceNumber NVARCHAR(40), DepositDate DATE,
                          DepositedAmount VARCHAR(25), IsCurrent BIT, RejectionReason NVARCHAR(250), ReviewedAt DATETIME2(3), AttemptsRejected INT, MaxAttempts INT,
                          Proofs NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Payments_GetByOrder @IDActor = @Ana, @IDOrder = @IDOrder;

    DECLARE @Status NVARCHAR(30) = (SELECT StatusName FROM #Result), @Bank NVARCHAR(80) = (SELECT BankName FROM #Result);
    DECLARE @Reference NVARCHAR(40) = (SELECT ReferenceNumber FROM #Result), @Proofs INT = (SELECT COUNT(*) FROM OPENJSON((SELECT Proofs FROM #Result)));
    DECLARE @Max INT = (SELECT MaxAttempts FROM #Result);
    EXEC tSQLt.AssertEqualsString @Expected = N'UnderReview', @Actual = @Status;
    EXEC tSQLt.AssertEqualsString @Expected = N'Test Bank', @Actual = @Bank;
    EXEC tSQLt.AssertEqualsString @Expected = N'REF-1', @Actual = @Reference;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Proofs;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Max;
END;
GO

CREATE PROCEDURE Test_Readers.[test after a rejection the customer sees the reason and the attempts used]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Outcome VARCHAR(30);
    EXEC Test_Readers.UnderReview @Email = N'ana@shopcart.test', @Key = N'key-1', @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N'Blurry photo', @Now = '2030-06-01T14:00:00', @Outcome = @Outcome OUTPUT;

    CREATE TABLE #Result (IDPayment INT, IDPaymentMethod TINYINT, MethodCode NVARCHAR(30), IDPaymentStatus TINYINT, StatusName NVARCHAR(30), Amount VARCHAR(25),
                          ExpiresAt DATETIME2(3), CreatedAt DATETIME2(3), ResolvedAt DATETIME2(3), IDBankAccount INT, BankName NVARCHAR(80), AccountType NVARCHAR(12),
                          AccountNumber NVARCHAR(30), HolderName NVARCHAR(120), Instructions NVARCHAR(300), ReferenceNumber NVARCHAR(40), DepositDate DATE,
                          DepositedAmount VARCHAR(25), IsCurrent BIT, RejectionReason NVARCHAR(250), ReviewedAt DATETIME2(3), AttemptsRejected INT, MaxAttempts INT,
                          Proofs NVARCHAR(MAX));
    INSERT INTO #Result EXEC dbo.SP_Payments_GetByOrder @IDActor = @Ana, @IDOrder = @IDOrder;

    DECLARE @Reason NVARCHAR(250) = (SELECT RejectionReason FROM #Result), @Rejected INT = (SELECT AttemptsRejected FROM #Result);
    EXEC tSQLt.AssertEqualsString @Expected = N'Blurry photo', @Actual = @Reason;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rejected;
END;
GO

CREATE PROCEDURE Test_Readers.[test another customer cannot read the payments of an order]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Order not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Payments_GetByOrder @IDActor = @Luis, @IDOrder = @IDOrder;
END;
GO

CREATE PROCEDURE Test_Readers.[test the owner and staff can open the proof but another customer cannot]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Readers.UnderReview @Email = N'ana@shopcart.test', @Key = N'key-1', @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @IDProof INT = Test_Readers.ProofOf(@IDPayment);

    CREATE TABLE #Owner (IDPaymentProof INT, StorageKey NVARCHAR(100), MimeType NVARCHAR(50), OriginalFileName NVARCHAR(255), SizeBytes INT);
    SELECT * INTO #Staff FROM #Owner;
    INSERT INTO #Owner EXEC dbo.SP_Payments_GetProof @IDActor = @Ana, @IDPayment = @IDPayment, @IDPaymentProof = @IDProof;
    INSERT INTO #Staff EXEC dbo.SP_Payments_GetProof @IDActor = @Admin, @AsStaff = 1, @IDPayment = @IDPayment, @IDPaymentProof = @IDProof;

    DECLARE @OwnerRows INT = (SELECT COUNT(*) FROM #Owner), @StaffRows INT = (SELECT COUNT(*) FROM #Staff), @Mime NVARCHAR(50) = (SELECT MimeType FROM #Owner);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OwnerRows;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @StaffRows;
    EXEC tSQLt.AssertEqualsString @Expected = N'image/png', @Actual = @Mime;
END;
GO

CREATE PROCEDURE Test_Readers.[test another customer opening the proof is told it does not exist]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    EXEC Test_Readers.UnderReview @Email = N'ana@shopcart.test', @Key = N'key-1', @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @IDProof INT = Test_Readers.ProofOf(@IDPayment);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Proof not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Payments_GetProof @IDActor = @Luis, @IDPayment = @IDPayment, @IDPaymentProof = @IDProof;
END;
GO

CREATE PROCEDURE Test_Readers.[test a proof asked through the payment of another order is not found]
AS
BEGIN
    DECLARE @First INT, @FirstPayment INT, @Second INT, @SecondPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Readers.UnderReview @Email = N'ana@shopcart.test', @Key = N'key-1', @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @IDOrder = @First OUTPUT, @IDPayment = @FirstPayment OUTPUT;
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @Method = 2, @IDOrder = @Second OUTPUT, @IDPayment = @SecondPayment OUTPUT;
    DECLARE @IDProof INT = Test_Readers.ProofOf(@FirstPayment);
    -- El comprobante es de ella, pero no del pago que la ruta nombra
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Proof not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Payments_GetProof @IDActor = @Ana, @IDPayment = @SecondPayment, @IDPaymentProof = @IDProof;
END;
GO

-- Cola de depósitos ---------------------------------------------------------------------------

CREATE PROCEDURE Test_Readers.[test the review queue lists deposits under review with their age and leaves the pending ones out]
AS
BEGIN
    DECLARE @Review INT, @ReviewPayment INT, @Waiting INT, @WaitingPayment INT;
    EXEC Test_Readers.UnderReview @Email = N'ana@shopcart.test', @Key = N'key-1', @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @IDOrder = @Review OUTPUT, @IDPayment = @ReviewPayment OUTPUT;
    EXEC Test_Lifecycle.Place @Email = N'luis@shopcart.test', @SKU = N'B-COOKIE', @Quantity = 1, @Key = N'key-2', @Method = 2, @IDOrder = @Waiting OUTPUT, @IDPayment = @WaitingPayment OUTPUT;

    CREATE TABLE #Result (IDPayment INT, IDOrder INT, OrderNumber NVARCHAR(20), CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), Amount VARCHAR(25),
                          IDPaymentStatus TINYINT, StatusName NVARCHAR(30), BankName NVARCHAR(80), ReferenceNumber NVARCHAR(40), DepositDate DATE,
                          DepositedAmount VARCHAR(25), RejectionReason NVARCHAR(250), IDPaymentProof INT, SubmittedAt DATETIME2(3), AgeHours INT, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Payments_ListPendingDeposits @Now = '2030-06-01T15:10:00';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result), @Id INT = (SELECT IDPayment FROM #Result), @Age INT = (SELECT AgeHours FROM #Result);
    DECLARE @Reference NVARCHAR(40) = (SELECT ReferenceNumber FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEquals @Expected = @ReviewPayment, @Actual = @Id;
    -- El comprobante se subió a las 12:10 y son las 15:10
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Age;
    EXEC tSQLt.AssertEqualsString @Expected = N'REF-1', @Actual = @Reference;
END;
GO

CREATE PROCEDURE Test_Readers.[test the review queue serves the oldest first and the history serves the newest first]
AS
BEGIN
    DECLARE @First INT, @FirstPayment INT, @Second INT, @SecondPayment INT;
    EXEC Test_Readers.UnderReview @Email = N'ana@shopcart.test', @Key = N'key-1', @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @IDOrder = @First OUTPUT, @IDPayment = @FirstPayment OUTPUT;
    EXEC Test_Readers.UnderReview @Email = N'luis@shopcart.test', @Key = N'key-2', @Hash = '0000000000000000000000000000000000000000000000000000000000000002', @Reference = N'REF-2', @IDOrder = @Second OUTPUT, @IDPayment = @SecondPayment OUTPUT;

    CREATE TABLE #Queue (IDPayment INT, IDOrder INT, OrderNumber NVARCHAR(20), CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), Amount VARCHAR(25),
                         IDPaymentStatus TINYINT, StatusName NVARCHAR(30), BankName NVARCHAR(80), ReferenceNumber NVARCHAR(40), DepositDate DATE,
                         DepositedAmount VARCHAR(25), RejectionReason NVARCHAR(250), IDPaymentProof INT, SubmittedAt DATETIME2(3), AgeHours INT, TotalCount INT);
    INSERT INTO #Queue EXEC dbo.SP_Payments_ListPendingDeposits @PageSize = 1;

    DECLARE @Head INT = (SELECT IDPayment FROM #Queue), @Total INT = (SELECT TotalCount FROM #Queue);
    EXEC tSQLt.AssertEquals @Expected = @FirstPayment, @Actual = @Head;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
END;
GO

CREATE PROCEDURE Test_Readers.[test the history filter lists the rejected deposits with their reason]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Outcome VARCHAR(30);
    EXEC Test_Readers.UnderReview @Email = N'ana@shopcart.test', @Key = N'key-1', @Hash = '0000000000000000000000000000000000000000000000000000000000000001', @Reference = N'REF-1', @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Payments_RejectDeposit @IDActor = @Operator, @IDPayment = @IDPayment, @Reason = N'Wrong amount', @Now = '2030-06-01T14:00:00', @Outcome = @Outcome OUTPUT;

    CREATE TABLE #Result (IDPayment INT, IDOrder INT, OrderNumber NVARCHAR(20), CustomerName NVARCHAR(120), CustomerEmail NVARCHAR(256), Amount VARCHAR(25),
                          IDPaymentStatus TINYINT, StatusName NVARCHAR(30), BankName NVARCHAR(80), ReferenceNumber NVARCHAR(40), DepositDate DATE,
                          DepositedAmount VARCHAR(25), RejectionReason NVARCHAR(250), IDPaymentProof INT, SubmittedAt DATETIME2(3), AgeHours INT, TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Payments_ListPendingDeposits @IDPaymentStatus = 4;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result), @Reason NVARCHAR(250) = (SELECT RejectionReason FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'Wrong amount', @Actual = @Reason;
END;
GO

-- Métodos y ventana de depósito ---------------------------------------------------------------

CREATE PROCEDURE Test_Readers.[test the deposit is offered with its deadline for a date far enough away]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;

    CREATE TABLE #Result (LeadTimeDays TINYINT, EarliestDeliveryDate DATE, DeliveryDateAllowed BIT, DepositDeadlineAt DATETIME2(3), MinutesAvailable BIGINT,
                          MinDepositHours INT, DepositAvailable BIT);
    INSERT INTO #Result EXEC dbo.SP_Payments_GetMethodsAndWindow @IDUser = @Ana, @DeliveryDate = '2030-06-20', @Now = '2030-06-01T12:00:00';

    DECLARE @Allowed INT = (SELECT CAST(DeliveryDateAllowed AS INT) FROM #Result), @Available INT = (SELECT CAST(DepositAvailable AS INT) FROM #Result);
    DECLARE @Deadline VARCHAR(23) = (SELECT CONVERT(VARCHAR(23), DepositDeadlineAt, 121) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Allowed;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Available;
    -- 24 horas de reserva, que es lo que llega antes que la fecha de entrega
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-02 12:00:00.000', @Actual = @Deadline;
END;
GO

CREATE PROCEDURE Test_Readers.[test the deposit is not offered when the delivery is too close]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;

    CREATE TABLE #Result (LeadTimeDays TINYINT, EarliestDeliveryDate DATE, DeliveryDateAllowed BIT, DepositDeadlineAt DATETIME2(3), MinutesAvailable BIGINT,
                          MinDepositHours INT, DepositAvailable BIT);
    INSERT INTO #Result EXEC dbo.SP_Payments_GetMethodsAndWindow @IDUser = @Ana, @DeliveryDate = '2030-06-01', @Now = '2030-06-01T12:00:00';

    DECLARE @Available INT = (SELECT CAST(DepositAvailable AS INT) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Available;
END;
GO

CREATE PROCEDURE Test_Readers.[test the longest lead time of the cart sets the earliest delivery date]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    UPDATE dbo.Products SET LeadTimeDays = 3 WHERE Name = N'Milk cake';
    EXEC Test_Orders.AddLine @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1;

    CREATE TABLE #Result (LeadTimeDays TINYINT, EarliestDeliveryDate DATE, DeliveryDateAllowed BIT, DepositDeadlineAt DATETIME2(3), MinutesAvailable BIGINT,
                          MinDepositHours INT, DepositAvailable BIT);
    INSERT INTO #Result EXEC dbo.SP_Payments_GetMethodsAndWindow @IDUser = @Ana, @DeliveryDate = '2030-06-03', @Now = '2030-06-01T12:00:00';

    DECLARE @Lead INT = (SELECT LeadTimeDays FROM #Result), @Earliest VARCHAR(10) = (SELECT CONVERT(VARCHAR(10), EarliestDeliveryDate, 120) FROM #Result);
    DECLARE @Allowed INT = (SELECT CAST(DeliveryDateAllowed AS INT) FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Lead;
    EXEC tSQLt.AssertEqualsString @Expected = N'2030-06-04', @Actual = @Earliest;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Allowed;
END;
GO

-- Cuentas bancarias ---------------------------------------------------------------------------

CREATE PROCEDURE Test_Readers.[test the bank list shows only active accounts unless asked for all]
AS
BEGIN
    CREATE TABLE #Active (IDBankAccount INT, BankName NVARCHAR(80), AccountType NVARCHAR(12), AccountNumber NVARCHAR(30), HolderName NVARCHAR(120),
                          Currency CHAR(3), Instructions NVARCHAR(300), IsActive BIT);
    SELECT * INTO #All FROM #Active;
    INSERT INTO #Active EXEC dbo.SP_BankAccounts_List;
    INSERT INTO #All EXEC dbo.SP_BankAccounts_List @IncludeInactive = 1;

    DECLARE @ActiveRows INT = (SELECT COUNT(*) FROM #Active), @AllRows INT = (SELECT COUNT(*) FROM #All);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @ActiveRows;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @AllRows;
END;
GO

CREATE PROCEDURE Test_Readers.[test an administrator creates and edits a bank account and the change is audited]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDSaved INT, @Again INT;
    EXEC dbo.SP_BankAccounts_Save @IDActor = @Admin, @BankName = N'New Bank', @AccountType = N'Savings', @AccountNumber = N'555', @HolderName = N'Dulce Aroma', @IDSaved = @IDSaved OUTPUT;
    EXEC dbo.SP_BankAccounts_Save @IDActor = @Admin, @IDBankAccount = @IDSaved, @BankName = N'New Bank', @AccountType = N'Checking', @AccountNumber = N'555',
         @HolderName = N'Dulce Aroma', @IsActive = 0, @IDSaved = @Again OUTPUT;

    DECLARE @Type NVARCHAR(12) = (SELECT AccountType FROM dbo.BankAccounts WHERE IDBankAccount = @IDSaved);
    DECLARE @Active INT = (SELECT CAST(IsActive AS INT) FROM dbo.BankAccounts WHERE IDBankAccount = @IDSaved);
    DECLARE @Audited INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE EntityName = N'BankAccount' AND EntityKey = CAST(@IDSaved AS NVARCHAR(40)));
    EXEC tSQLt.AssertEquals @Expected = @IDSaved, @Actual = @Again;
    EXEC tSQLt.AssertEqualsString @Expected = N'Checking', @Actual = @Type;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Audited;
END;
GO

CREATE PROCEDURE Test_Readers.[test an operator cannot save a bank account]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @IDSaved INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator can save%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_BankAccounts_Save @IDActor = @Operator, @BankName = N'X', @AccountType = N'Savings', @AccountNumber = N'1', @HolderName = N'H', @IDSaved = @IDSaved OUTPUT;
END;
GO

CREATE PROCEDURE Test_Readers.[test a repeated bank account is a conflict]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDSaved INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%already registered%', @ExpectedErrorNumber = 50409;
    EXEC dbo.SP_BankAccounts_Save @IDActor = @Admin, @BankName = N'Test Bank', @AccountType = N'Checking', @AccountNumber = N'1112223334', @HolderName = N'H', @IDSaved = @IDSaved OUTPUT;
END;
GO

CREATE PROCEDURE Test_Readers.[test editing an unknown bank account answers not found]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test'), @IDSaved INT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Bank account not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_BankAccounts_Save @IDActor = @Admin, @IDBankAccount = -1, @BankName = N'X', @AccountType = N'Savings', @AccountNumber = N'1', @HolderName = N'H', @IDSaved = @IDSaved OUTPUT;
END;
GO

-- Auditoría y versiones -----------------------------------------------------------------------

CREATE PROCEDURE Test_Readers.[test the audit query filters by module and pages the newest first]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC dbo.SP_Audit_Record @Module = N'Orders', @EntityName = N'Order', @EntityKey = N'1', @Action = N'Create', @IDUser = @Admin;
    EXEC dbo.SP_Audit_Record @Module = N'Orders', @EntityName = N'Order', @EntityKey = N'2', @Action = N'Create', @IDUser = @Admin;
    EXEC dbo.SP_Audit_Record @Module = N'Payments', @EntityName = N'Payment', @EntityKey = N'9', @Action = N'Create', @IDUser = @Admin;

    CREATE TABLE #Result (IDAuditLog BIGINT, Module NVARCHAR(30), EntityName NVARCHAR(50), EntityKey NVARCHAR(40), Action NVARCHAR(20), PreviousValue NVARCHAR(MAX),
                          NewValue NVARCHAR(MAX), IDUser INT, UserName NVARCHAR(120), CreatedAt DATETIME2(3), TotalCount INT);
    INSERT INTO #Result EXEC dbo.SP_Audit_Query @Module = N'Orders', @PageSize = 1;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result), @Key NVARCHAR(40) = (SELECT EntityKey FROM #Result), @Total INT = (SELECT TotalCount FROM #Result);
    DECLARE @Name NVARCHAR(120) = (SELECT UserName FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'2', @Actual = @Key;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
    EXEC tSQLt.AssertEqualsString @Expected = N'Test Admin', @Actual = @Name;
END;
GO

CREATE PROCEDURE Test_Readers.[test the audit query refuses a reversed range]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%From must be before To%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Audit_Query @From = '2030-02-01', @To = '2030-01-01';
END;
GO

CREATE PROCEDURE Test_Readers.[test the object versions list only the current version of each object]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.ObjectVersions';
    INSERT INTO dbo.ObjectVersions (ObjectName, ObjectType, Version, Change, IsCurrent)
    VALUES (N'SP_A', 'P', N'1.0.0', N'first', 0), (N'SP_A', 'P', N'1.1.0', N'second', 1), (N'SP_B', 'P', N'1.0.0', N'only', 1);

    CREATE TABLE #Result (ObjectName SYSNAME, ObjectType CHAR(2), Version NVARCHAR(20), Change NVARCHAR(300));
    INSERT INTO #Result EXEC dbo.SP_System_ListObjectVersions;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #Result), @Version NVARCHAR(20) = (SELECT Version FROM #Result WHERE ObjectName = N'SP_A');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Rows;
    EXEC tSQLt.AssertEqualsString @Expected = N'1.1.0', @Actual = @Version;
END;
GO
