/* =====================================================================
   Objeto   : Test_Seeds (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Las semillas de referencia dejan exactamente los datos que el código y la API suponen
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). Supone que db:migrate ya aplicó las semillas.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Seeds';
GO

-- Las tablas #Expected declaran COLLATE DATABASE_DEFAULT en el texto: una tabla temporal toma el collation de tempdb
-- y, si el servidor usa otro, compararla con una tabla de la base de datos daría un conflicto de collation

CREATE PROCEDURE Test_Seeds.[test the roles are the three fixed roles]
AS
BEGIN
    CREATE TABLE #Expected (IDRole TINYINT, Name NVARCHAR(30) COLLATE DATABASE_DEFAULT);
    INSERT INTO #Expected VALUES (1, N'Customer'), (2, N'Operator'), (3, N'Administrator');

    SELECT IDRole, Name INTO #Actual FROM dbo.Roles;

    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

CREATE PROCEDURE Test_Seeds.[test the order statuses are the eight states of the lifecycle]
AS
BEGIN
    CREATE TABLE #Expected (IDOrderStatus TINYINT, Name NVARCHAR(30) COLLATE DATABASE_DEFAULT);
    INSERT INTO #Expected VALUES
        (1, N'PendingPayment'), (2, N'Paid'), (3, N'InPreparation'), (4, N'Dispatched'),
        (5, N'Delivered'), (6, N'Cancelled'), (7, N'PartiallyReturned'), (8, N'Returned');

    SELECT IDOrderStatus, Name INTO #Actual FROM dbo.OrderStatuses;

    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

CREATE PROCEDURE Test_Seeds.[test the order transitions are exactly the documented ones]
AS
BEGIN
    CREATE TABLE #Expected (IDFromStatus TINYINT, IDToStatus TINYINT);
    INSERT INTO #Expected VALUES (1, 2), (1, 6), (2, 3), (2, 6), (3, 4), (3, 6), (4, 5), (5, 7), (5, 8), (7, 7), (7, 8);

    SELECT IDFromStatus, IDToStatus INTO #Actual FROM dbo.OrderStatusTransitions;

    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

-- Cancelado y Devuelto son terminales: ningún pedido sale de ellos
CREATE PROCEDURE Test_Seeds.[test cancelled and returned orders have no way out]
AS
BEGIN
    DECLARE @Exits INT = (SELECT COUNT(*) FROM dbo.OrderStatusTransitions WHERE IDFromStatus IN (6, 8));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Exits;
END;
GO

-- Una vez despachado, el pedido ya no puede cancelarse
CREATE PROCEDURE Test_Seeds.[test a dispatched order cannot be cancelled]
AS
BEGIN
    DECLARE @Allowed INT = (SELECT COUNT(*) FROM dbo.OrderStatusTransitions WHERE IDFromStatus IN (4, 5) AND IDToStatus = 6);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Allowed;
END;
GO

CREATE PROCEDURE Test_Seeds.[test the payment methods carry the codes of the API]
AS
BEGIN
    CREATE TABLE #Expected (IDPaymentMethod TINYINT, Code NVARCHAR(30) COLLATE DATABASE_DEFAULT, Name NVARCHAR(60) COLLATE DATABASE_DEFAULT);
    INSERT INTO #Expected VALUES (1, N'CARD', N'Card'), (2, N'BANK_DEPOSIT', N'BankDeposit');

    SELECT IDPaymentMethod, Code, Name INTO #Actual FROM dbo.PaymentMethods;

    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

CREATE PROCEDURE Test_Seeds.[test the payment statuses are the eight states of the lifecycle]
AS
BEGIN
    CREATE TABLE #Expected (IDPaymentStatus TINYINT, Name NVARCHAR(30) COLLATE DATABASE_DEFAULT);
    INSERT INTO #Expected VALUES
        (1, N'Pending'), (2, N'UnderReview'), (3, N'Approved'), (4, N'Rejected'),
        (5, N'Failed'), (6, N'Expired'), (7, N'Refunded'), (8, N'Cancelled');

    SELECT IDPaymentStatus, Name INTO #Actual FROM dbo.PaymentStatuses;

    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

CREATE PROCEDURE Test_Seeds.[test the payment transitions are exactly the documented ones]
AS
BEGIN
    CREATE TABLE #Expected (IDFromStatus TINYINT, IDToStatus TINYINT);
    INSERT INTO #Expected VALUES (1, 2), (1, 3), (1, 5), (1, 6), (1, 8), (2, 3), (2, 4), (2, 8), (3, 7);

    SELECT IDFromStatus, IDToStatus INTO #Actual FROM dbo.PaymentStatusTransitions;

    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

-- Un pago en revisión lo resuelve un operador: no puede vencer por tiempo
CREATE PROCEDURE Test_Seeds.[test a payment under review cannot expire]
AS
BEGIN
    DECLARE @Allowed INT = (SELECT COUNT(*) FROM dbo.PaymentStatusTransitions WHERE IDFromStatus = 2 AND IDToStatus = 6);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Allowed;
END;
GO

CREATE PROCEDURE Test_Seeds.[test the inventory movement types include the exit used by the unique index]
AS
BEGIN
    CREATE TABLE #Expected (IDInventoryMovementType TINYINT, Name NVARCHAR(30) COLLATE DATABASE_DEFAULT);
    INSERT INTO #Expected VALUES (1, N'Entry'), (2, N'Exit'), (3, N'Adjustment'), (4, N'Return');

    SELECT IDInventoryMovementType, Name INTO #Actual FROM dbo.InventoryMovementTypes;

    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

CREATE PROCEDURE Test_Seeds.[test the configuration holds the fifteen default settings]
AS
BEGIN
    CREATE TABLE #Expected (SettingKey NVARCHAR(50) COLLATE DATABASE_DEFAULT, SettingValue NVARCHAR(100) COLLATE DATABASE_DEFAULT);
    INSERT INTO #Expected VALUES
        (N'ReservationMinutes', N'15'), (N'DepositReservationHours', N'24'), (N'MinDepositHours', N'2'),
        (N'RejectionGraceHours', N'12'), (N'MaxDepositAttempts', N'3'), (N'AbandonedCartHours', N'24'),
        (N'ShippingCost', N'25.00'), (N'FreeShippingFrom', N'300.00'), (N'VatRate', N'12'),
        (N'IdempotencyKeyHours', N'24'),
        (N'RetentionRefreshTokenDays', N'30'), (N'RetentionWebhookDays', N'90'), (N'RetentionGuestCartDays', N'30'),
        (N'RetentionReservationDays', N'90'), (N'RetentionDdlHistoryDays', N'365');

    SELECT SettingKey, SettingValue INTO #Actual FROM dbo.Configuration;

    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

-- Los montos de configuración se leen como DECIMAL, nunca como coma flotante
CREATE PROCEDURE Test_Seeds.[test the money settings convert exactly to DECIMAL(18,2)]
AS
BEGIN
    DECLARE @Shipping DECIMAL(18,2) = (SELECT CAST(SettingValue AS DECIMAL(18,2)) FROM dbo.Configuration WHERE SettingKey = N'ShippingCost');
    DECLARE @FreeFrom DECIMAL(18,2) = (SELECT CAST(SettingValue AS DECIMAL(18,2)) FROM dbo.Configuration WHERE SettingKey = N'FreeShippingFrom');

    EXEC tSQLt.AssertEquals @Expected = 25.00, @Actual = @Shipping;
    EXEC tSQLt.AssertEquals @Expected = 300.00, @Actual = @FreeFrom;
END;
GO

-- La tasa se usa como la fracción 12/112 porque los precios ya incluyen IVA (ADR-0008)
CREATE PROCEDURE Test_Seeds.[test the VAT rate is the integer 12]
AS
BEGIN
    DECLARE @Rate INT = (SELECT CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'VatRate');
    EXEC tSQLt.AssertEquals @Expected = 12, @Actual = @Rate;
END;
GO
