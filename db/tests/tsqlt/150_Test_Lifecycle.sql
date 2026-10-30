/* =====================================================================
   Objeto   : Test_Lifecycle (clase de pruebas tSQLt)
   Version  : 1.0.0
   Cambio   : Ciclo de vida del pedido: avance de estados, cancelación, devoluciones, reembolsos y conciliación de importes
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo CI; nunca se instala en la base entregada (ADR-0023). Las devoluciones simultáneas las cubre
              npm run sql:concurrency.
   ===================================================================== */
EXEC tSQLt.NewTestClass 'Test_Lifecycle';
GO

-- Todo lo del pago más las transiciones que usa el ciclo de vida y el tipo de movimiento de devolución
CREATE PROCEDURE Test_Lifecycle.SetUp
AS
BEGIN
    EXEC Test_Payments.SetUp;

    IF NOT EXISTS (SELECT 1 FROM dbo.InventoryMovementTypes WHERE IDInventoryMovementType = 4) INSERT INTO dbo.InventoryMovementTypes VALUES (4, N'Return');

    INSERT INTO dbo.OrderStatusTransitions (IDFromStatus, IDToStatus)
    SELECT t.F, t.T FROM (VALUES (2, 3), (2, 6), (3, 4), (3, 6), (4, 5), (5, 7), (5, 8), (7, 7), (7, 8)) AS t (F, T)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderStatusTransitions x WHERE x.IDFromStatus = t.F AND x.IDToStatus = t.T);
    INSERT INTO dbo.PaymentStatusTransitions (IDFromStatus, IDToStatus)
    SELECT t.F, t.T FROM (VALUES (3, 7)) AS t (F, T)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.PaymentStatusTransitions x WHERE x.IDFromStatus = t.F AND x.IDToStatus = t.T);
END;
GO

-- Ayudas ------------------------------------------------------------------------------------

-- Crea un pedido de una sola variante con depósito (2) o tarjeta (1)
CREATE PROCEDURE Test_Lifecycle.Place
    @Email NVARCHAR(256), @SKU NVARCHAR(40), @Quantity INT, @Key NVARCHAR(64), @Method TINYINT, @IDOrder INT OUTPUT, @IDPayment INT OUTPUT
AS
BEGIN
    DECLARE @IDUser INT = Test_Shop.UserId(@Email), @Address INT = Test_Orders.AddressId(@Email);
    DECLARE @Bank INT = CASE WHEN @Method = 2 THEN Test_Orders.BankId(N'Test Bank') END;
    DECLARE @IDReservation INT, @Number NVARCHAR(20), @Expires DATETIME2(3);
    EXEC Test_Orders.AddLine @Email = @Email, @SKU = @SKU, @Quantity = @Quantity;
    EXEC Test_Orders.Reserve @Email = @Email, @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @IDUser, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-20',
         @IDPaymentMethod = @Method, @IdempotencyKey = @Key, @IDBankAccount = @Bank, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
END;
GO

-- Aprueba el pago por su monto exacto
CREATE PROCEDURE Test_Lifecycle.Pay @IDPayment INT
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Amount DECIMAL(18,2), @Outcome VARCHAR(20);
    SET @Amount = (SELECT Amount FROM dbo.Payments WHERE IDPayment = @IDPayment);
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = @Amount, @Source = N'Operator', @IDUser = @Operator,
         @Now = '2030-06-01T13:00:00', @Outcome = @Outcome OUTPUT;
END;
GO

-- Avanza el pedido pagado hasta el estado pedido (3 preparación, 4 despachado, 5 entregado)
CREATE PROCEDURE Test_Lifecycle.Advance @IDOrder INT, @To TINYINT
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Step TINYINT = 3;
    WHILE @Step <= @To
    BEGIN
        EXEC dbo.SP_Orders_ChangeStatus @IDActor = @Operator, @IDOrder = @IDOrder, @NewStatus = @Step, @Now = '2030-06-02T09:00:00';
        SET @Step += 1;
    END;
END;
GO

-- Pedido pagado y avanzado hasta @To
CREATE PROCEDURE Test_Lifecycle.Make
    @Email NVARCHAR(256), @SKU NVARCHAR(40), @Quantity INT, @Key NVARCHAR(64), @To TINYINT, @IDOrder INT OUTPUT, @IDPayment INT OUTPUT
AS
BEGIN
    EXEC Test_Lifecycle.Place @Email = @Email, @SKU = @SKU, @Quantity = @Quantity, @Key = @Key, @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC Test_Lifecycle.Pay @IDPayment = @IDPayment;
    IF @To >= 3 EXEC Test_Lifecycle.Advance @IDOrder = @IDOrder, @To = @To;
END;
GO

CREATE FUNCTION Test_Lifecycle.LineOf (@IDOrder INT, @SKU NVARCHAR(40)) RETURNS INT
AS
BEGIN
    RETURN (SELECT IDOrderLine FROM dbo.OrderLines WHERE IDOrder = @IDOrder AND SKU = @SKU);
END;
GO

CREATE FUNCTION Test_Lifecycle.Lines (@IDOrderLine INT, @Quantity INT) RETURNS NVARCHAR(200)
AS
BEGIN
    RETURN CONCAT(N'[{"idOrderLine":', @IDOrderLine, N',"quantity":', @Quantity, N'}]');
END;
GO

-- Importe reembolsable -----------------------------------------------------------------------

CREATE PROCEDURE Test_Lifecycle.[test the refund of a line adds up to its total cent by cent]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.OrderLines';
    EXEC tSQLt.FakeTable @TableName = N'dbo.ReturnLines';
    -- 100.00 entre 3 unidades: 33.33 + 33.33 + 33.34
    INSERT INTO dbo.OrderLines (IDOrderLine, Quantity, LineTotal, ReturnedQuantity) VALUES (1, 3, 100.00, 0);

    DECLARE @First BIGINT = (SELECT RefundCents FROM dbo.FU_Orders_RefundableAmount(1, 1));
    UPDATE dbo.OrderLines SET ReturnedQuantity = 1 WHERE IDOrderLine = 1;
    INSERT INTO dbo.ReturnLines (IDOrderLine, Quantity, RefundAmount) VALUES (1, 1, 33.33);
    DECLARE @Second BIGINT = (SELECT RefundCents FROM dbo.FU_Orders_RefundableAmount(1, 1));
    UPDATE dbo.OrderLines SET ReturnedQuantity = 2 WHERE IDOrderLine = 1;
    INSERT INTO dbo.ReturnLines (IDOrderLine, Quantity, RefundAmount) VALUES (1, 1, 33.33);
    DECLARE @Last BIGINT = (SELECT RefundCents FROM dbo.FU_Orders_RefundableAmount(1, 1));

    EXEC tSQLt.AssertEquals @Expected = 3333, @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = 3333, @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 3334, @Actual = @Last;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test the share of a unit rounds half to even and the last unit closes the line]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.OrderLines';
    EXEC tSQLt.FakeTable @TableName = N'dbo.ReturnLines';
    -- 10.01 entre 2 unidades: 5.005 cae en empate exacto y el cociente 500 es par, así que baja; la última devuelve 5.01
    INSERT INTO dbo.OrderLines (IDOrderLine, Quantity, LineTotal, ReturnedQuantity) VALUES (1, 2, 10.01, 0);

    DECLARE @First BIGINT = (SELECT RefundCents FROM dbo.FU_Orders_RefundableAmount(1, 1));
    UPDATE dbo.OrderLines SET ReturnedQuantity = 1 WHERE IDOrderLine = 1;
    INSERT INTO dbo.ReturnLines (IDOrderLine, Quantity, RefundAmount) VALUES (1, 1, 5.00);
    DECLARE @Last BIGINT = (SELECT RefundCents FROM dbo.FU_Orders_RefundableAmount(1, 1));

    EXEC tSQLt.AssertEquals @Expected = 500, @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = 501, @Actual = @Last;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test returning every unit at once refunds the exact line total]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.OrderLines';
    EXEC tSQLt.FakeTable @TableName = N'dbo.ReturnLines';
    INSERT INTO dbo.OrderLines (IDOrderLine, Quantity, LineTotal, ReturnedQuantity) VALUES (1, 3, 166.35, 0);

    DECLARE @All BIGINT = (SELECT RefundCents FROM dbo.FU_Orders_RefundableAmount(1, 3));
    EXEC tSQLt.AssertEquals @Expected = 16635, @Actual = @All;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a quantity of zero or above the pending units has no refund]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.OrderLines';
    EXEC tSQLt.FakeTable @TableName = N'dbo.ReturnLines';
    INSERT INTO dbo.OrderLines (IDOrderLine, Quantity, LineTotal, ReturnedQuantity) VALUES (1, 3, 100.00, 2);

    DECLARE @Zero BIGINT = (SELECT RefundCents FROM dbo.FU_Orders_RefundableAmount(1, 0));
    DECLARE @TooMany BIGINT = (SELECT RefundCents FROM dbo.FU_Orders_RefundableAmount(1, 2));
    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.FU_Orders_RefundableAmount(1, 2));

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    DECLARE @Shown1 INT = CASE WHEN @Zero IS NULL AND @TooMany IS NULL THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Shown1;
END;
GO

-- Cambio de estado ---------------------------------------------------------------------------

CREATE PROCEDURE Test_Lifecycle.[test an operator moves a paid order through preparation, dispatch and delivery with its history]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @History INT = (SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE IDOrder = @IDOrder AND IDNewStatus IN (3, 4, 5));
    DECLARE @Audited INT = (SELECT COUNT(*) FROM dbo.AuditLog WHERE Module = N'Orders' AND EntityKey = CAST(@IDOrder AS NVARCHAR(40)) AND Action = N'StatusChange');

    EXEC tSQLt.AssertEquals @Expected = 5, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @History;
    DECLARE @Shown2 INT = CASE WHEN @Audited >= 3 THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Shown2;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a customer cannot change the status of an order]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%operator or administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_ChangeStatus @IDActor = @Ana, @IDOrder = @IDOrder, @NewStatus = 3;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test an order cannot skip a step]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INVALID_STATE_TRANSITION:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_ChangeStatus @IDActor = @Operator, @IDOrder = @IDOrder, @NewStatus = 5;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test the status procedure refuses the states that move money or stock]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INVALID_STATE_TRANSITION:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_ChangeStatus @IDActor = @Operator, @IDOrder = @IDOrder, @NewStatus = 6;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test the second operator asking for the same step is refused]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 3, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INVALID_STATE_TRANSITION:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_ChangeStatus @IDActor = @Operator, @IDOrder = @IDOrder, @NewStatus = 3;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test changing the status of an unknown order answers not found]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Order not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_ChangeStatus @IDActor = @Operator, @IDOrder = -1, @NewStatus = 3;
END;
GO

-- Cancelación --------------------------------------------------------------------------------

CREATE PROCEDURE Test_Lifecycle.[test a customer cancels an order that is still pending payment]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Changed my mind';

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @Reservation NVARCHAR(12) = (SELECT Status FROM dbo.Reservations WHERE IDOrder = @IDOrder);
    DECLARE @Refunds INT = (SELECT COUNT(*) FROM dbo.Refunds);
    DECLARE @Source NVARCHAR(20) = (SELECT TOP (1) Source FROM dbo.PaymentStatusHistory WHERE IDPayment = @IDPayment ORDER BY IDPaymentStatusHistory DESC);

    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEqualsString @Expected = N'Released', @Actual = @Reservation;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Refunds;
    EXEC tSQLt.AssertEqualsString @Expected = N'Customer', @Actual = @Source;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test another customer cannot cancel the order and is told it does not exist]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Luis INT = Test_Shop.UserId(N'luis@shopcart.test');
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Order not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Luis, @IDOrder = @IDOrder, @Reason = N'Not mine';
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test cancelling a paid order restores the stock through the ledger and leaves a pending refund]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 2, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @OnHandBefore INT = (SELECT OnHandStock FROM dbo.Variants WHERE SKU = N'A-CAKE');

    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Wrong date';

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @OnHandAfter INT = (SELECT OnHandStock FROM dbo.Variants WHERE SKU = N'A-CAKE');
    DECLARE @Returns INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDInventoryMovementType = 4 AND Quantity = 2 AND ResultingBalance = 10);
    DECLARE @Refunds INT = (SELECT COUNT(*) FROM dbo.Refunds WHERE IDPayment = @IDPayment AND Status = N'Pending' AND IDReturn IS NULL);
    DECLARE @RefundAmount DECIMAL(18,2) = (SELECT Amount FROM dbo.Refunds WHERE IDPayment = @IDPayment);
    DECLARE @PaymentAmount DECIMAL(18,2) = (SELECT Amount FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);

    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @OnHandBefore;
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @OnHandAfter;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Returns;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Refunds;
    DECLARE @Shown3 INT = CASE WHEN @RefundAmount = @PaymentAmount THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Shown3;
    -- El dinero sigue cobrado hasta que el administrador marque el reembolso como procesado
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @PaymentStatus;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test an operator can cancel an order in preparation]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 3, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;

    EXEC dbo.SP_Orders_Cancel @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Oven broke';

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Refunds INT = (SELECT COUNT(*) FROM dbo.Refunds WHERE IDPayment = @IDPayment);
    EXEC tSQLt.AssertEquals @Expected = 6, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Refunds;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a dispatched order can no longer be cancelled]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 4, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INVALID_STATE_TRANSITION:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Too late';
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test cancelling twice does nothing the second time]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'First';
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Second';

    DECLARE @Refunds INT = (SELECT COUNT(*) FROM dbo.Refunds);
    DECLARE @Returns INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDInventoryMovementType = 4);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Refunds;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Returns;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a cancellation needs a reason]
AS
BEGIN
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Reason are required%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = 1, @Reason = N'  ';
END;
GO

-- Devoluciones -------------------------------------------------------------------------------

CREATE PROCEDURE Test_Lifecycle.[test a partial return refunds the proportional amount and restores the stock]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDReturn INT, @IDRefund INT, @Amount DECIMAL(18,2);
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @IDLine INT = Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE'), @Lines NVARCHAR(200);
    SET @Lines = Test_Lifecycle.Lines(@IDLine, 1);

    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Crushed box', @Lines = @Lines,
         @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Type NVARCHAR(8) = (SELECT Type FROM dbo.Returns WHERE IDReturn = @IDReturn);
    DECLARE @Returned INT = (SELECT ReturnedQuantity FROM dbo.OrderLines WHERE IDOrderLine = @IDLine);
    DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.Variants WHERE SKU = N'C-CUPCAKE');
    DECLARE @Movements INT = (SELECT COUNT(*) FROM dbo.InventoryMovements WHERE IDOrder = @IDOrder AND IDInventoryMovementType = 4 AND Quantity = 1 AND ResultingBalance = 8);
    DECLARE @RefundStatus NVARCHAR(12) = (SELECT Status FROM dbo.Refunds WHERE IDRefund = @IDRefund);
    DECLARE @LineAmount DECIMAL(18,2) = (SELECT RefundAmount FROM dbo.ReturnLines WHERE IDReturn = @IDReturn);

    EXEC tSQLt.AssertEquals @Expected = 7, @Actual = @Status;
    EXEC tSQLt.AssertEqualsString @Expected = N'Partial', @Actual = @Type;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Returned;
    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @OnHand;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Movements;
    EXEC tSQLt.AssertEqualsString @Expected = N'Pending', @Actual = @RefundStatus;
    DECLARE @Shown4 VARCHAR(25) = CAST(@Amount AS VARCHAR(25));
    EXEC tSQLt.AssertEqualsString @Expected = N'55.45', @Actual = @Shown4;
    DECLARE @Shown5 VARCHAR(25) = CAST(@LineAmount AS VARCHAR(25));
    EXEC tSQLt.AssertEqualsString @Expected = N'55.45', @Actual = @Shown5;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test returning the rest completes the order and the refunds add up to the exact line total]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDReturn INT, @IDRefund INT, @Amount DECIMAL(18,2);
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @IDLine INT = Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE'), @One NVARCHAR(200), @Two NVARCHAR(200);
    SET @One = Test_Lifecycle.Lines(@IDLine, 1);
    SET @Two = Test_Lifecycle.Lines(@IDLine, 2);

    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'First', @Lines = @One,
         @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Rest', @Lines = @Two,
         @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @LastType NVARCHAR(8) = (SELECT Type FROM dbo.Returns WHERE IDReturn = @IDReturn);
    DECLARE @Refunded DECIMAL(18,2) = (SELECT SUM(RefundAmount) FROM dbo.ReturnLines WHERE IDOrderLine = @IDLine);
    DECLARE @LineTotal DECIMAL(18,2) = (SELECT LineTotal FROM dbo.OrderLines WHERE IDOrderLine = @IDLine);
    DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.Variants WHERE SKU = N'C-CUPCAKE');

    EXEC tSQLt.AssertEquals @Expected = 8, @Actual = @Status;
    EXEC tSQLt.AssertEqualsString @Expected = N'Full', @Actual = @LastType;
    DECLARE @Shown6 INT = CASE WHEN @Refunded = @LineTotal THEN 1 ELSE 0 END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Shown6;
    EXEC tSQLt.AssertEquals @Expected = 10, @Actual = @OnHand;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a second partial return keeps the order partially returned]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDReturn INT, @IDRefund INT, @Amount DECIMAL(18,2);
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @IDLine INT = Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE'), @One NVARCHAR(200);
    SET @One = Test_Lifecycle.Lines(@IDLine, 1);

    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'First', @Lines = @One, @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Second', @Lines = @One, @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @History INT = (SELECT COUNT(*) FROM dbo.OrderStatusHistory WHERE IDOrder = @IDOrder AND IDPreviousStatus IN (5, 7) AND IDNewStatus = 7);
    EXEC tSQLt.AssertEquals @Expected = 7, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @History;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a return of two lines in one request refunds both]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    DECLARE @IDReturn INT, @IDRefund INT, @Amount DECIMAL(18,2);
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Address INT = Test_Orders.AddressId(N'ana@shopcart.test');
    DECLARE @IDReservation INT, @Number NVARCHAR(20), @Expires DATETIME2(3), @Bank INT = Test_Orders.BankId(N'Test Bank');
    EXEC Test_Orders.AddExampleLines @Email = N'ana@shopcart.test';
    EXEC Test_Orders.Reserve @Email = N'ana@shopcart.test', @IDReservation = @IDReservation OUTPUT;
    EXEC dbo.SP_Orders_CreateOrder @IDUser = @Ana, @IDReservation = @IDReservation, @IDAddress = @Address, @RequestedDeliveryDate = '2030-06-20',
         @IDPaymentMethod = 2, @IdempotencyKey = N'key-1', @IDBankAccount = @Bank, @Now = '2030-06-01T12:05:00',
         @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT, @OrderNumber = @Number OUTPUT, @PaymentExpiresAt = @Expires OUTPUT;
    EXEC Test_Lifecycle.Pay @IDPayment = @IDPayment;
    EXEC Test_Lifecycle.Advance @IDOrder = @IDOrder, @To = 5;

    DECLARE @Lines NVARCHAR(400) = CONCAT(N'[{"idOrderLine":', Test_Lifecycle.LineOf(@IDOrder, N'A-CAKE'), N',"quantity":1},{"idOrderLine":',
                                          Test_Lifecycle.LineOf(@IDOrder, N'B-COOKIE'), N',"quantity":1}]');
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Wrong order', @Lines = @Lines,
         @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;

    DECLARE @ReturnLines INT = (SELECT COUNT(*) FROM dbo.ReturnLines WHERE IDReturn = @IDReturn);
    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    -- Sin cupón las líneas valen su precio: 145.00 + 45.00
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @ReturnLines;
    EXEC tSQLt.AssertEquals @Expected = 7, @Actual = @Status;
    DECLARE @Shown7 VARCHAR(25) = CAST(@Amount AS VARCHAR(25));
    EXEC tSQLt.AssertEqualsString @Expected = N'190.00', @Actual = @Shown7;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test returning more units than were sold is refused and changes nothing]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @Lines NVARCHAR(200) = Test_Lifecycle.Lines(Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE'), 4);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'RETURN_QUANTITY_EXCEEDED:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Too many', @Lines = @Lines;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a refused return leaves the order and the stock untouched]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @Lines NVARCHAR(200) = Test_Lifecycle.Lines(Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE'), 4);
    BEGIN TRY
        EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Too many', @Lines = @Lines;
    END TRY
    BEGIN CATCH
    END CATCH;

    DECLARE @Status INT = (SELECT IDOrderStatus FROM dbo.Orders WHERE IDOrder = @IDOrder);
    DECLARE @Returns INT = (SELECT COUNT(*) FROM dbo.Returns);
    DECLARE @OnHand INT = (SELECT OnHandStock FROM dbo.Variants WHERE SKU = N'C-CUPCAKE');
    EXEC tSQLt.AssertEquals @Expected = 5, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Returns;
    EXEC tSQLt.AssertEquals @Expected = 7, @Actual = @OnHand;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test an order that was not delivered cannot be returned]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 4, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @Lines NVARCHAR(200) = Test_Lifecycle.Lines(Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE'), 1);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'INVALID_STATE_TRANSITION:%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Early', @Lines = @Lines;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a customer cannot register a return]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @Lines NVARCHAR(200) = Test_Lifecycle.Lines(Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE'), 1);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%operator or administrator%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Returns_Register @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Mine', @Lines = @Lines;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a line repeated in the request is refused]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @IDLine INT = Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE');
    DECLARE @Lines NVARCHAR(400) = CONCAT(N'[{"idOrderLine":', @IDLine, N',"quantity":1},{"idOrderLine":', @IDLine, N',"quantity":1}]');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%cannot repeat%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Twice', @Lines = @Lines;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a request that is not a JSON array is refused]
AS
BEGIN
    DECLARE @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%JSON array%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = 1, @Reason = N'Broken', @Lines = N'not json';
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a line of another order is reported as not found]
AS
BEGIN
    DECLARE @First INT, @FirstPayment INT, @Second INT, @SecondPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @First OUTPUT, @IDPayment = @FirstPayment OUTPUT;
    EXEC Test_Lifecycle.Make @Email = N'luis@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-2', @To = 5, @IDOrder = @Second OUTPUT, @IDPayment = @SecondPayment OUTPUT;
    DECLARE @Lines NVARCHAR(200) = Test_Lifecycle.Lines(Test_Lifecycle.LineOf(@Second, N'A-CAKE'), 1);
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Order line not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @First, @Reason = N'Mixed up', @Lines = @Lines;
END;
GO

-- Reembolsos ---------------------------------------------------------------------------------

CREATE PROCEDURE Test_Lifecycle.[test marking a partial refund as processed writes the ledger and keeps the payment approved]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @IDReturn INT, @IDRefund INT, @Amount DECIMAL(18,2);
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    DECLARE @Lines NVARCHAR(200) = Test_Lifecycle.Lines(Test_Lifecycle.LineOf(@IDOrder, N'C-CUPCAKE'), 1);
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @IDOrder, @Reason = N'Crushed', @Lines = @Lines,
         @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;

    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-100';

    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.Refunds WHERE IDRefund = @IDRefund);
    DECLARE @Reference NVARCHAR(80) = (SELECT ExternalReference FROM dbo.Refunds WHERE IDRefund = @IDRefund);
    DECLARE @Ledger DECIMAL(18,2) = (SELECT Amount FROM dbo.FinancialMovements WHERE IDRefund = @IDRefund AND Type = N'Refund');
    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);

    EXEC tSQLt.AssertEqualsString @Expected = N'Processed', @Actual = @Status;
    EXEC tSQLt.AssertEqualsString @Expected = N'TRF-100', @Actual = @Reference;
    DECLARE @Shown8 VARCHAR(25) = CAST(@Ledger AS VARCHAR(25));
    EXEC tSQLt.AssertEqualsString @Expected = N'-55.45', @Actual = @Shown8;
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @PaymentStatus;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test refunding everything that was charged marks the payment as refunded]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Wrong date';
    DECLARE @IDRefund INT = (SELECT IDRefund FROM dbo.Refunds WHERE IDPayment = @IDPayment);

    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-200';

    DECLARE @PaymentStatus INT = (SELECT IDPaymentStatus FROM dbo.Payments WHERE IDPayment = @IDPayment);
    DECLARE @History INT = (SELECT COUNT(*) FROM dbo.PaymentStatusHistory WHERE IDPayment = @IDPayment AND IDPreviousStatus = 3 AND IDNewStatus = 7);
    DECLARE @Net DECIMAL(18,2) = (SELECT SUM(Amount) FROM dbo.FinancialMovements WHERE IDOrder = @IDOrder);
    EXEC tSQLt.AssertEquals @Expected = 7, @Actual = @PaymentStatus;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @History;
    -- El libro de dinero del pedido cuadra a cero: se cobró y se devolvió lo mismo
    DECLARE @Shown9 VARCHAR(25) = CAST(@Net AS VARCHAR(25));
    EXEC tSQLt.AssertEqualsString @Expected = N'0.00', @Actual = @Shown9;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test marking the same refund twice writes the ledger once]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Wrong date';
    DECLARE @IDRefund INT = (SELECT IDRefund FROM dbo.Refunds WHERE IDPayment = @IDPayment);

    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-200';
    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-200';

    DECLARE @Entries INT = (SELECT COUNT(*) FROM dbo.FinancialMovements WHERE IDRefund = @IDRefund);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Entries;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a processed refund cannot be marked as failed]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Wrong date';
    DECLARE @IDRefund INT = (SELECT IDRefund FROM dbo.Refunds WHERE IDPayment = @IDPayment);
    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-200';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%cannot change%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Failed';
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a failed refund can be processed later]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Wrong date';
    DECLARE @IDRefund INT = (SELECT IDRefund FROM dbo.Refunds WHERE IDPayment = @IDPayment);

    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Failed';
    DECLARE @LedgerAfterFailure INT = (SELECT COUNT(*) FROM dbo.FinancialMovements WHERE IDRefund = @IDRefund);
    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-300';

    DECLARE @Status NVARCHAR(12) = (SELECT Status FROM dbo.Refunds WHERE IDRefund = @IDRefund);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @LedgerAfterFailure;
    EXEC tSQLt.AssertEqualsString @Expected = N'Processed', @Actual = @Status;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test processing a refund needs the reference of the transfer]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%ExternalReference%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = 1, @Status = N'Processed', @ExternalReference = N' ';
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test an operator cannot mark a refund]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Operator INT = Test_Shop.UserId(N'operator@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Wrong date';
    DECLARE @IDRefund INT = (SELECT IDRefund FROM dbo.Refunds WHERE IDPayment = @IDPayment);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%administrator can mark%', @ExpectedErrorNumber = 50422;
    EXEC dbo.SP_Refunds_Mark @IDActor = @Operator, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-1';
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test marking an unknown refund answers not found]
AS
BEGIN
    DECLARE @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Refund not found%', @ExpectedErrorNumber = 50404;
    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = -1, @Status = N'Failed';
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test a late payment that is refunded gets its charge and its refund in the ledger]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    DECLARE @Outcome VARCHAR(20);
    EXEC Test_Lifecycle.Place @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @Method = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Changed my mind';
    -- El cliente ya había transferido: el pago llega con el pedido cancelado
    EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = @IDPayment, @ReceivedAmount = 145.00, @Source = N'Webhook', @Outcome = @Outcome OUTPUT;
    DECLARE @IDRefund INT = (SELECT IDRefund FROM dbo.Refunds WHERE IDPayment = @IDPayment);

    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-400';

    DECLARE @Charge DECIMAL(18,2) = (SELECT SUM(Amount) FROM dbo.FinancialMovements WHERE IDPayment = @IDPayment AND Type = N'Charge');
    DECLARE @Refund DECIMAL(18,2) = (SELECT SUM(Amount) FROM dbo.FinancialMovements WHERE IDPayment = @IDPayment AND Type = N'Refund');
    EXEC tSQLt.AssertEqualsString @Expected = N'Orphan', @Actual = @Outcome;
    DECLARE @Shown10 VARCHAR(25) = CAST(@Charge AS VARCHAR(25));
    EXEC tSQLt.AssertEqualsString @Expected = N'145.00', @Actual = @Shown10;
    DECLARE @Shown11 VARCHAR(25) = CAST(@Refund AS VARCHAR(25));
    EXEC tSQLt.AssertEqualsString @Expected = N'-145.00', @Actual = @Shown11;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test the refund list filters by status and shows the amount as text]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT, @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    EXEC dbo.SP_Orders_Cancel @IDActor = @Ana, @IDOrder = @IDOrder, @Reason = N'Wrong date';

    CREATE TABLE #Pending (IDRefund INT, IDPayment INT, IDOrder INT, OrderNumber NVARCHAR(20), IDReturn INT, Amount DECIMAL(18,2), AmountText VARCHAR(25),
                           Reason NVARCHAR(250), Status NVARCHAR(12), ExternalReference NVARCHAR(80), CreatedAt DATETIME2(3), ProcessedAt DATETIME2(3));
    INSERT INTO #Pending EXEC dbo.SP_Refunds_List @Status = N'Pending';
    CREATE TABLE #Processed (IDRefund INT, IDPayment INT, IDOrder INT, OrderNumber NVARCHAR(20), IDReturn INT, Amount DECIMAL(18,2), AmountText VARCHAR(25),
                             Reason NVARCHAR(250), Status NVARCHAR(12), ExternalReference NVARCHAR(80), CreatedAt DATETIME2(3), ProcessedAt DATETIME2(3));
    INSERT INTO #Processed EXEC dbo.SP_Refunds_List @Status = N'Processed';

    DECLARE @PendingRows INT = (SELECT COUNT(*) FROM #Pending), @ProcessedRows INT = (SELECT COUNT(*) FROM #Processed);
    DECLARE @Text VARCHAR(25) = (SELECT AmountText FROM #Pending);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PendingRows;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ProcessedRows;
    EXEC tSQLt.AssertEqualsString @Expected = N'145.00', @Actual = @Text;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test the refund list refuses an unknown status]
AS
BEGIN
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = N'%Status must be%', @ExpectedErrorNumber = 50400;
    EXEC dbo.SP_Refunds_List @Status = N'Waiting';
END;
GO

-- Conciliación -------------------------------------------------------------------------------

CREATE PROCEDURE Test_Lifecycle.[test the reconciliation is empty after paying, returning, cancelling and refunding]
AS
BEGIN
    DECLARE @First INT, @FirstPayment INT, @Second INT, @SecondPayment INT;
    DECLARE @IDReturn INT, @IDRefund INT, @Amount DECIMAL(18,2);
    DECLARE @Ana INT = Test_Shop.UserId(N'ana@shopcart.test'), @Operator INT = Test_Shop.UserId(N'operator@shopcart.test'), @Admin INT = Test_Shop.UserId(N'admin@shopcart.test');
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @First OUTPUT, @IDPayment = @FirstPayment OUTPUT;
    EXEC Test_Lifecycle.Make @Email = N'luis@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-2', @To = 2, @IDOrder = @Second OUTPUT, @IDPayment = @SecondPayment OUTPUT;

    DECLARE @Lines NVARCHAR(200) = Test_Lifecycle.Lines(Test_Lifecycle.LineOf(@First, N'C-CUPCAKE'), 2);
    EXEC dbo.SP_Returns_Register @IDActor = @Operator, @IDOrder = @First, @Reason = N'Crushed', @Lines = @Lines,
         @IDReturn = @IDReturn OUTPUT, @IDRefund = @IDRefund OUTPUT, @RefundAmount = @Amount OUTPUT;
    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @IDRefund, @Status = N'Processed', @ExternalReference = N'TRF-1';
    EXEC dbo.SP_Orders_Cancel @IDActor = @Operator, @IDOrder = @Second, @Reason = N'Stock error';
    DECLARE @Cancelled INT = (SELECT IDRefund FROM dbo.Refunds WHERE IDPayment = @SecondPayment);
    EXEC dbo.SP_Refunds_Mark @IDActor = @Admin, @IDRefund = @Cancelled, @Status = N'Processed', @ExternalReference = N'TRF-2';

    DECLARE @Rows INT = (SELECT COUNT(*) FROM dbo.VW_Reconciliation_Amounts);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Rows;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test the reconciliation detects a refund above what was charged]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    INSERT INTO dbo.Refunds (IDPayment, Amount, Reason, Status) VALUES (@IDPayment, 145.01, N'Tampered', N'Pending');

    DECLARE @Found INT = (SELECT COUNT(*) FROM dbo.VW_Reconciliation_Amounts WHERE [Check] = N'RefundsExceedPayment' AND EntityKey = CAST(@IDPayment AS NVARCHAR(40)));
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test the reconciliation detects units marked as returned without a return]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'C-CUPCAKE', @Quantity = 3, @Key = N'key-1', @To = 5, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    UPDATE dbo.OrderLines SET ReturnedQuantity = 1 WHERE IDOrder = @IDOrder;

    DECLARE @Found INT = (SELECT COUNT(*) FROM dbo.VW_Reconciliation_Amounts WHERE [Check] = N'ReturnedQuantity');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
END;
GO

CREATE PROCEDURE Test_Lifecycle.[test the reconciliation detects an approved payment with no charge in the ledger]
AS
BEGIN
    DECLARE @IDOrder INT, @IDPayment INT;
    EXEC Test_Lifecycle.Make @Email = N'ana@shopcart.test', @SKU = N'A-CAKE', @Quantity = 1, @Key = N'key-1', @To = 2, @IDOrder = @IDOrder OUTPUT, @IDPayment = @IDPayment OUTPUT;
    -- El libro no se puede borrar: se ve el mismo descuadre con un pago aprobado a mano que nunca cobró
    EXEC tSQLt.FakeTable @TableName = N'dbo.FinancialMovements';

    DECLARE @Found INT = (SELECT COUNT(*) FROM dbo.VW_Reconciliation_Amounts WHERE [Check] = N'ChargeVsPayment' AND EntityKey = CAST(@IDPayment AS NVARCHAR(40)));
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
END;
GO
