/* =====================================================================
   Objeto   : dbo.SP_Payments_ConfirmPayment
   Version  : 1.0.0
   Cambio   : Primera versión: núcleo idempotente que aprueba un pago, marca el pedido como pagado y da salida al inventario
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Los resultados esperados NO son errores: se informan en @Outcome (Approved, AlreadyApproved, Orphan).
              Errores: 50400, 50404 pago inexistente, 50422 estado que no permite aprobar o monto distinto del pedido.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_ConfirmPayment
  @IDPayment      INT,
  @ReceivedAmount DECIMAL(18,2),
  @Source         NVARCHAR(20),
  @IDUser         INT           = NULL,
  @ProviderFee    DECIMAL(18,2) = NULL,
  @Now            DATETIME2(3)  = NULL,
  @Outcome        VARCHAR(20)   = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDPayment IS NULL OR @ReceivedAmount IS NULL OR @ReceivedAmount <= 0
     OR @Source NOT IN (N'Customer', N'Operator', N'Webhook', N'Reconciliation', N'Job') OR @ProviderFee < 0
    THROW 50400, 'IDPayment, a ReceivedAmount above zero, a valid Source and a ProviderFee of zero or more are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @Outcome = NULL;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- 1. Bloquea el pago: dos confirmaciones simultáneas (dos operadores, un webhook repetido) se serializan aquí
  DECLARE @IDOrder INT, @PaymentStatus TINYINT, @Amount DECIMAL(18,2);
  SELECT @IDOrder = IDOrder, @PaymentStatus = IDPaymentStatus, @Amount = Amount
  FROM dbo.Payments WITH (UPDLOCK, ROWLOCK) WHERE IDPayment = @IDPayment;

  IF @IDOrder IS NULL
    THROW 50404, 'Payment not found.', 1;

  -- 2. Idempotencia natural: un pago ya aprobado no hace nada y no falla
  IF @PaymentStatus = 3
  BEGIN
    SET @Outcome = 'AlreadyApproved';
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;

  DECLARE @OrderStatus TINYINT, @OrderNumber NVARCHAR(20), @OrderCustomer INT;
  SELECT @OrderStatus = IDOrderStatus, @OrderNumber = OrderNumber, @OrderCustomer = IDUser
  FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE IDOrder = @IDOrder;

  -- 3. Un pago que llega cuando el pedido ya venció o se canceló no resucita el pedido: el dinero se registra para devolverlo.
  --    Se informa en @Outcome y no con THROW, porque un THROW deshace la transacción y el reembolso pendiente se perdería.
  IF @PaymentStatus IN (6, 8) OR @OrderStatus = 6
  BEGIN
    EXEC dbo.SP_Payments_RegisterOrphanPayment @IDPayment = @IDPayment, @ReceivedAmount = @ReceivedAmount, @Now = @Now;
    SET @Outcome = 'Orphan';
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;

  IF @PaymentStatus NOT IN (1, 2)
    THROW 50422, 'The payment is not in a state that allows approving it.', 1;
  IF @OrderStatus <> 1
    THROW 50422, 'The order is not pending payment.', 1;

  -- 4. El monto recibido debe ser exactamente el del pedido: no hay aprobaciones parciales
  IF @ReceivedAmount <> @Amount
    THROW 50422, 'AMOUNT_MISMATCH: The amount received does not match the order total.', 1;

  -- La reserva debe seguir viva: si no, sus unidades ya se devolvieron al stock y descontarlas otra vez lo descuadraría
  DECLARE @IDReservation INT = (SELECT TOP (1) IDReservation FROM dbo.Reservations WHERE IDOrder = @IDOrder AND Status = N'Active');
  IF @IDReservation IS NULL
    THROW 50422, 'The reservation of the order is no longer active.', 1;

  -- 5. Pago aprobado y pedido pagado. Los triggers validan ambas transiciones y el índice único impide dos pagos aprobados.
  UPDATE dbo.Payments SET IDPaymentStatus = 3, ResolvedAt = @Now, ProviderFee = @ProviderFee WHERE IDPayment = @IDPayment;
  UPDATE dbo.Orders SET IDOrderStatus = 2, PaidAt = @Now WHERE IDOrder = @IDOrder;

  -- 6. Descuenta la existencia física y la reservada, y escribe la salida en el libro con el saldo resultante. Las variantes se
  --    bloquean en orden ascendente, el mismo de la reserva y de la cancelación.
  DECLARE @ToLock TABLE (IDVariant INT PRIMARY KEY);
  -- El índice por pedido fuerza una búsqueda: un recorrido completo chocaría con las filas sin confirmar de otros pedidos
  INSERT INTO @ToLock (IDVariant) SELECT DISTINCT IDVariant FROM dbo.OrderLines WITH (INDEX(IX_OrderLines_Order)) WHERE IDOrder = @IDOrder;
  DECLARE @IDVariant INT = 0, @Locked INT;
  WHILE 1 = 1
  BEGIN
    SELECT TOP (1) @IDVariant = IDVariant FROM @ToLock WHERE IDVariant > @IDVariant ORDER BY IDVariant;
    IF @@ROWCOUNT = 0 BREAK;
    SELECT @Locked = IDVariant FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant;
  END;

  DECLARE @Exits TABLE (IDVariant INT PRIMARY KEY, Quantity INT NOT NULL, ResultingBalance INT NOT NULL);
  UPDATE v
  SET OnHandStock = v.OnHandStock - l.Quantity, ReservedStock = v.ReservedStock - l.Quantity
  OUTPUT inserted.IDVariant, l.Quantity, inserted.OnHandStock INTO @Exits (IDVariant, Quantity, ResultingBalance)
  FROM dbo.Variants AS v WITH (UPDLOCK, ROWLOCK)
  JOIN (SELECT IDVariant, Quantity = SUM(Quantity) FROM dbo.OrderLines WITH (INDEX(IX_OrderLines_Order)) WHERE IDOrder = @IDOrder GROUP BY IDVariant) AS l ON l.IDVariant = v.IDVariant;

  -- El movimiento necesita un usuario; cuando confirma el sistema (un webhook, un job) se atribuye al cliente del pedido
  DECLARE @MovementUser INT = ISNULL(@IDUser, @OrderCustomer);
  INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser, IDOrder, CreatedAt)
  SELECT IDVariant, 2, -Quantity, ResultingBalance, CONCAT(N'Sale of order ', @OrderNumber), @MovementUser, @IDOrder, @Now FROM @Exits;

  UPDATE dbo.Reservations SET Status = N'Consumed' WHERE IDReservation = @IDReservation;

  -- 7. Libro de dinero: el cobro y, si existe, la comisión del proveedor. Solo se anexa.
  INSERT INTO dbo.FinancialMovements (IDOrder, IDPayment, Type, Amount, IDUser, CreatedAt)
  VALUES (@IDOrder, @IDPayment, N'Charge', @Amount, @IDUser, @Now);
  IF @ProviderFee > 0
    INSERT INTO dbo.FinancialMovements (IDOrder, IDPayment, Type, Amount, IDUser, CreatedAt)
    VALUES (@IDOrder, @IDPayment, N'Fee', -@ProviderFee, @IDUser, @Now);

  -- 8. Historiales y bitácora
  INSERT INTO dbo.PaymentStatusHistory (IDPayment, IDPreviousStatus, IDNewStatus, IDUser, Source, CreatedAt, Comment)
  VALUES (@IDPayment, @PaymentStatus, 3, @IDUser, @Source, @Now, N'Payment approved');
  INSERT INTO dbo.OrderStatusHistory (IDOrder, IDPreviousStatus, IDNewStatus, IDUser, CreatedAt, Comment)
  VALUES (@IDOrder, 1, 2, @IDUser, @Now, N'Payment approved');

  DECLARE @PreviousValue NVARCHAR(40) = CONCAT(N'{"IDPaymentStatus":', @PaymentStatus, N'}');
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDPayment AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Payments', @EntityName = N'Payment', @EntityKey = @EntityKey, @Action = N'StatusChange',
       @PreviousValue = @PreviousValue, @NewValue = N'{"IDPaymentStatus":3}', @IDUser = @IDUser;

  SET @Outcome = 'Approved';
  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
