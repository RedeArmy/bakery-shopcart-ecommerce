/* =====================================================================
   Objeto   : dbo.SP_Returns_Register
   Version  : 1.0.0
   Cambio   : Primera versión: un operador registra la devolución total o parcial de un pedido entregado
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @Lines es un arreglo JSON [{"idOrderLine":1,"quantity":2}]; una línea no puede repetirse. El reembolso de cada
              línea sale de FU_Orders_RefundableAmount, que cierra exacto en la última unidad. Devuelve las unidades al libro de
              inventario y deja un reembolso pendiente. Errores: 50400, 50404 pedido o línea inexistente, 50422 actor sin permiso,
              INVALID_STATE_TRANSITION (el pedido no está entregado) o RETURN_QUANTITY_EXCEEDED.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Returns_Register
  @IDActor      INT,
  @IDOrder      INT,
  @Reason       NVARCHAR(250),
  @Lines        NVARCHAR(MAX),
  @Now          DATETIME2(3) = NULL,
  @IDReturn     INT           = NULL OUTPUT,
  @IDRefund     INT           = NULL OUTPUT,
  @RefundAmount DECIMAL(18,2) = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @Reason = LTRIM(RTRIM(@Reason));
  IF @IDActor IS NULL OR @IDOrder IS NULL OR ISNULL(@Reason, N'') = N'' OR ISNULL(ISJSON(@Lines), 0) = 0
    THROW 50400, 'IDActor, IDOrder, a Reason and a JSON array of lines are required.', 1;

  DECLARE @Requested TABLE (IDOrderLine INT NOT NULL, Quantity INT NOT NULL);
  INSERT INTO @Requested (IDOrderLine, Quantity)
  SELECT IDOrderLine, Quantity
  FROM OPENJSON(@Lines) WITH (IDOrderLine INT '$.idOrderLine', Quantity INT '$.quantity');

  IF NOT EXISTS (SELECT 1 FROM @Requested)
     OR EXISTS (SELECT 1 FROM @Requested WHERE IDOrderLine IS NULL OR Quantity IS NULL OR Quantity < 1)
     OR EXISTS (SELECT IDOrderLine FROM @Requested GROUP BY IDOrderLine HAVING COUNT(*) > 1)
    THROW 50400, 'Each line needs an idOrderLine and a quantity of at least 1, and a line cannot repeat.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @IDReturn = NULL; SET @IDRefund = NULL; SET @RefundAmount = NULL;

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- Una devolución pasa por la mano de quien recibe la mercadería, no del cliente
  IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE IDUser = @IDActor AND IDRole IN (2, 3) AND IsActive = 1)
    THROW 50422, 'Only an active operator or administrator can register a return.', 1;

  -- El bloqueo del pedido serializa dos devoluciones simultáneas de la misma línea: la segunda ve lo ya devuelto
  DECLARE @Status TINYINT, @OrderNumber NVARCHAR(20);
  SELECT @Status = IDOrderStatus, @OrderNumber = OrderNumber FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE IDOrder = @IDOrder;
  IF @Status IS NULL
    THROW 50404, 'Order not found.', 1;
  IF @Status NOT IN (5, 7)
    THROW 50422, 'INVALID_STATE_TRANSITION: Only a delivered order can be returned.', 1;

  IF EXISTS (SELECT 1 FROM @Requested AS r WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderLines WHERE IDOrderLine = r.IDOrderLine AND IDOrder = @IDOrder))
    THROW 50404, 'Order line not found.', 1;

  -- Reembolso por línea en centavos enteros. NULL significa que se piden más unidades de las que quedan por devolver.
  DECLARE @Computed TABLE (IDOrderLine INT PRIMARY KEY, IDVariant INT NOT NULL, Quantity INT NOT NULL, RefundCents BIGINT NOT NULL);
  IF EXISTS (SELECT 1 FROM @Requested AS r CROSS APPLY dbo.FU_Orders_RefundableAmount(r.IDOrderLine, r.Quantity) AS f WHERE f.RefundCents IS NULL)
    THROW 50422, 'RETURN_QUANTITY_EXCEEDED: A line has fewer units pending return than requested.', 1;
  INSERT INTO @Computed (IDOrderLine, IDVariant, Quantity, RefundCents)
  SELECT r.IDOrderLine, l.IDVariant, r.Quantity, f.RefundCents
  FROM @Requested AS r
  JOIN dbo.OrderLines AS l ON l.IDOrderLine = r.IDOrderLine
  CROSS APPLY dbo.FU_Orders_RefundableAmount(r.IDOrderLine, r.Quantity) AS f;

  DECLARE @IDPayment INT;
  SELECT @IDPayment = IDPayment FROM dbo.Payments WITH (UPDLOCK, ROWLOCK, INDEX(IX_Payments_Order)) WHERE IDOrder = @IDOrder AND IDPaymentStatus = 3;
  IF @IDPayment IS NULL
    THROW 50422, 'The order has no approved payment to refund.', 1;

  -- Si tras esta devolución no queda ninguna unidad pendiente, el pedido completo quedó devuelto
  DECLARE @PendingAfter INT =
    (SELECT SUM(Quantity - ReturnedQuantity) FROM dbo.OrderLines WITH (INDEX(IX_OrderLines_Order)) WHERE IDOrder = @IDOrder)
    - (SELECT SUM(Quantity) FROM @Computed);
  DECLARE @NewStatus TINYINT = CASE WHEN @PendingAfter = 0 THEN 8 ELSE 7 END;
  DECLARE @TotalCents BIGINT = (SELECT SUM(RefundCents) FROM @Computed);
  SET @RefundAmount = CAST(@TotalCents AS DECIMAL(18,2)) / CAST(100 AS DECIMAL(18,2));

  INSERT INTO dbo.Returns (IDOrder, Type, Reason, RefundAmount, IDUser, CreatedAt)
  VALUES (@IDOrder, CASE WHEN @NewStatus = 8 THEN N'Full' ELSE N'Partial' END, LEFT(@Reason, 250), @RefundAmount, @IDActor, @Now);
  SET @IDReturn = SCOPE_IDENTITY();

  INSERT INTO dbo.ReturnLines (IDReturn, IDOrderLine, Quantity, RefundAmount)
  SELECT @IDReturn, IDOrderLine, Quantity, CAST(RefundCents AS DECIMAL(18,2)) / CAST(100 AS DECIMAL(18,2)) FROM @Computed;

  UPDATE ol SET ReturnedQuantity = ol.ReturnedQuantity + c.Quantity
  FROM dbo.OrderLines AS ol
  JOIN @Computed AS c ON c.IDOrderLine = ol.IDOrderLine;

  -- Las unidades vuelven a la existencia física. Las variantes se bloquean en orden ascendente, igual que en el resto de procedimientos.
  DECLARE @ToLock TABLE (IDVariant INT PRIMARY KEY);
  INSERT INTO @ToLock (IDVariant) SELECT DISTINCT IDVariant FROM @Computed;
  DECLARE @IDVariant INT = 0, @Locked INT;
  WHILE 1 = 1
  BEGIN
    SELECT TOP (1) @IDVariant = IDVariant FROM @ToLock WHERE IDVariant > @IDVariant ORDER BY IDVariant;
    IF @@ROWCOUNT = 0 BREAK;
    SELECT @Locked = IDVariant FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant;
  END;

  DECLARE @Entries TABLE (IDVariant INT PRIMARY KEY, Quantity INT NOT NULL, ResultingBalance INT NOT NULL);
  UPDATE v
  SET OnHandStock = v.OnHandStock + c.Quantity
  OUTPUT inserted.IDVariant, c.Quantity, inserted.OnHandStock INTO @Entries (IDVariant, Quantity, ResultingBalance)
  FROM dbo.Variants AS v WITH (UPDLOCK, ROWLOCK)
  JOIN (SELECT IDVariant, Quantity = SUM(Quantity) FROM @Computed GROUP BY IDVariant) AS c ON c.IDVariant = v.IDVariant;

  INSERT INTO dbo.InventoryMovements (IDVariant, IDInventoryMovementType, Quantity, ResultingBalance, Reason, IDUser, IDOrder, CreatedAt)
  SELECT IDVariant, 4, Quantity, ResultingBalance, CONCAT(N'Return of order ', @OrderNumber), @IDActor, @IDOrder, @Now FROM @Entries;

  INSERT INTO dbo.Refunds (IDPayment, IDReturn, Amount, Reason, Status, CreatedAt)
  VALUES (@IDPayment, @IDReturn, @RefundAmount, LEFT(CONCAT(N'Return: ', @Reason), 250), N'Pending', @Now);
  SET @IDRefund = SCOPE_IDENTITY();

  UPDATE dbo.Orders SET IDOrderStatus = @NewStatus WHERE IDOrder = @IDOrder;
  INSERT INTO dbo.OrderStatusHistory (IDOrder, IDPreviousStatus, IDNewStatus, IDUser, CreatedAt, Comment)
  VALUES (@IDOrder, @Status, @NewStatus, @IDActor, @Now, LEFT(@Reason, 250));

  DECLARE @ReturnKey NVARCHAR(40) = CAST(@IDReturn AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Orders', @EntityName = N'Return', @EntityKey = @ReturnKey, @Action = N'Create',
       @NewValue = @Lines, @IDUser = @IDActor;
  DECLARE @OrderKey NVARCHAR(40) = CAST(@IDOrder AS NVARCHAR(40));
  DECLARE @Previous NVARCHAR(MAX) = CONCAT(N'{"IDOrderStatus":', @Status, N'}');
  DECLARE @New NVARCHAR(MAX) = CONCAT(N'{"IDOrderStatus":', @NewStatus, N'}');
  EXEC dbo.SP_Audit_Record @Module = N'Orders', @EntityName = N'Order', @EntityKey = @OrderKey, @Action = N'StatusChange',
       @PreviousValue = @Previous, @NewValue = @New, @IDUser = @IDActor;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
