/* =====================================================================
   Objeto   : dbo.SP_Orders_Cancel
   Version  : 1.0.0
   Cambio   : Primera versión: cancelación de un pedido por su cliente o por un operador, antes de despacharlo
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Un pedido pendiente de pago se cancela con SP_Orders_CancelPending (no hubo salida física). Uno pagado o en
              preparación devuelve las unidades al libro de inventario y deja un reembolso pendiente por todo lo cobrado.
              Cancelar un pedido ya cancelado no hace nada. Errores: 50400, 50404 pedido inexistente o ajeno,
              50422 INVALID_STATE_TRANSITION (despachado o más adelante) o actor sin permiso.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Orders_Cancel
  @IDActor INT,
  @IDOrder INT,
  @Reason  NVARCHAR(250),
  @Now     DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Reason = LTRIM(RTRIM(@Reason));
  IF @IDActor IS NULL OR @IDOrder IS NULL OR ISNULL(@Reason, N'') = N''
    THROW 50400, 'IDActor, IDOrder and a Reason are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  DECLARE @Role TINYINT = (SELECT IDRole FROM dbo.Users WHERE IDUser = @IDActor AND IsActive = 1);
  IF @Role IS NULL
    THROW 50422, 'The actor is not an active user.', 1;

  DECLARE @Status TINYINT, @Owner INT, @OrderNumber NVARCHAR(20);
  SELECT @Status = IDOrderStatus, @Owner = IDUser, @OrderNumber = OrderNumber
  FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE IDOrder = @IDOrder;

  -- El pedido de otra persona responde igual que uno inexistente (IDOR); el personal puede cancelar cualquiera
  IF @Status IS NULL OR (@Role = 1 AND @Owner <> @IDActor)
    THROW 50404, 'Order not found.', 1;
  IF @Role NOT IN (1, 2, 3)
    THROW 50422, 'The actor cannot cancel orders.', 1;

  DECLARE @Source NVARCHAR(20) = CASE WHEN @Role = 1 THEN N'Customer' ELSE N'Operator' END;

  -- Repetir la cancelación no es un error: el cliente puede pulsar dos veces
  IF @Status = 6
  BEGIN
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;

  -- Despachado en adelante ya salió de la pastelería: solo cabe devolverlo cuando esté entregado
  IF @Status NOT IN (1, 2, 3)
    THROW 50422, 'INVALID_STATE_TRANSITION: An order that was dispatched can no longer be cancelled.', 1;

  IF @Status = 1
  BEGIN
    -- Sin cobro ni salida física: se devuelve la reserva, se anula el cupón y se cierran los pagos abiertos
    EXEC dbo.SP_Orders_CancelPending @IDOrder = @IDOrder, @OpenPaymentStatus = 8, @Reason = @Reason, @Source = @Source,
         @IDUser = @IDActor, @Now = @Now;
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;

  -- Pedido pagado: se bloquea el pago aprobado, que es el que se reembolsa
  DECLARE @IDPayment INT, @Amount DECIMAL(18,2);
  SELECT @IDPayment = IDPayment, @Amount = Amount
  FROM dbo.Payments WITH (UPDLOCK, ROWLOCK, INDEX(IX_Payments_Order)) WHERE IDOrder = @IDOrder AND IDPaymentStatus = 3;
  IF @IDPayment IS NULL
    THROW 50422, 'The paid order has no approved payment to refund.', 1;

  UPDATE dbo.Orders SET IDOrderStatus = 6 WHERE IDOrder = @IDOrder;
  INSERT INTO dbo.OrderStatusHistory (IDOrder, IDPreviousStatus, IDNewStatus, IDUser, CreatedAt, Comment)
  VALUES (@IDOrder, @Status, 6, @IDActor, @Now, LEFT(@Reason, 250));

  -- Las unidades vuelven a la existencia física. Las variantes se bloquean en orden ascendente, el mismo de la reserva y del pago.
  DECLARE @ToLock TABLE (IDVariant INT PRIMARY KEY);
  INSERT INTO @ToLock (IDVariant) SELECT DISTINCT IDVariant FROM dbo.OrderLines WITH (INDEX(IX_OrderLines_Order)) WHERE IDOrder = @IDOrder;
  DECLARE @IDVariant INT = 0, @Locked INT;
  WHILE 1 = 1
  BEGIN
    SELECT TOP (1) @IDVariant = IDVariant FROM @ToLock WHERE IDVariant > @IDVariant ORDER BY IDVariant;
    IF @@ROWCOUNT = 0 BREAK;
    SELECT @Locked = IDVariant FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant;
  END;

  DECLARE @Entries TABLE (IDVariant INT PRIMARY KEY, Quantity INT NOT NULL, ResultingBalance INT NOT NULL);
  UPDATE v
  SET OnHandStock = v.OnHandStock + l.Quantity
  OUTPUT inserted.IDVariant, l.Quantity, inserted.OnHandStock INTO @Entries (IDVariant, Quantity, ResultingBalance)
  FROM dbo.Variants AS v WITH (UPDLOCK, ROWLOCK)
  JOIN (SELECT IDVariant, Quantity = SUM(Quantity) FROM dbo.OrderLines WITH (INDEX(IX_OrderLines_Order)) WHERE IDOrder = @IDOrder GROUP BY IDVariant) AS l
    ON l.IDVariant = v.IDVariant;

  INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser, IDOrder, CreatedAt)
  SELECT IDVariant, 4, Quantity, ResultingBalance, CONCAT(N'Cancellation of order ', @OrderNumber), @IDActor, @IDOrder, @Now FROM @Entries;

  -- El dinero cobrado queda por devolver; el libro de dinero lo registra cuando se marque como procesado (SP_Refunds_Mark)
  INSERT INTO dbo.Refunds (IDPayment, IDReturn, Amount, Reason, Status, CreatedAt)
  VALUES (@IDPayment, NULL, @Amount, LEFT(CONCAT(N'Order cancelled: ', @Reason), 250), N'Pending', @Now);

  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDOrder AS NVARCHAR(40));
  DECLARE @Previous NVARCHAR(MAX) = CONCAT(N'{"IDOrderStatus":', @Status, N'}');
  EXEC dbo.SP_Audit_Record @Module = N'Orders', @EntityName = N'Order', @EntityKey = @EntityKey, @Action = N'StatusChange',
       @PreviousValue = @Previous, @NewValue = N'{"IDOrderStatus":6}', @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
