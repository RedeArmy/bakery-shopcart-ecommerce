/* =====================================================================
   Objeto   : dbo.SP_Orders_CancelPending
   Version  : 1.0.0
   Cambio   : Primera versión: cancela un pedido que aún no se pagó y devuelve todo lo que retenía (uso interno)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. La usan el rechazo definitivo del depósito, la expiración y, más adelante, la cancelación del cliente.
              Errores: 50400, 50404 pedido inexistente, 50422 el pedido ya no está pendiente de pago. Cancelar un pedido
              ya cancelado no hace nada.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Orders_CancelPending
  @IDOrder           INT,
  -- Estado en que quedan los pagos abiertos: 6 Expired (vencimiento) u 8 Cancelled (cancelación)
  @OpenPaymentStatus TINYINT,
  @Reason            NVARCHAR(250),
  @Source            NVARCHAR(20),
  -- NULL cuando lo hace el sistema (job de expiración)
  @IDUser            INT          = NULL,
  @Now               DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDOrder IS NULL OR @OpenPaymentStatus NOT IN (6, 8) OR ISNULL(LTRIM(RTRIM(@Reason)), N'') = N''
     OR @Source NOT IN (N'Customer', N'Operator', N'Webhook', N'Reconciliation', N'Job')
    THROW 50400, 'IDOrder, an OpenPaymentStatus of 6 or 8, a Reason and a valid Source are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- El bloqueo del pedido serializa la cancelación con una confirmación de pago que llegue a la vez
  DECLARE @OrderStatus TINYINT, @IDCoupon INT;
  SELECT @OrderStatus = IDOrderStatus, @IDCoupon = IDCoupon FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE IDOrder = @IDOrder;

  IF @OrderStatus IS NULL
    THROW 50404, 'Order not found.', 1;

  -- Repetir la cancelación no es un error: el trabajo de expiración puede encontrar el pedido ya cancelado por el cliente
  IF @OrderStatus = 6
  BEGIN
    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;

  IF @OrderStatus <> 1
    THROW 50422, 'Only an order pending payment can be cancelled here.', 1;

  UPDATE dbo.Orders SET IDOrderStatus = 6 WHERE IDOrder = @IDOrder;
  INSERT INTO dbo.OrderStatusHistory (IDOrder, IDPreviousStatus, IDNewStatus, IDUser, CreatedAt, Comment)
  VALUES (@IDOrder, 1, 6, @IDUser, @Now, LEFT(LTRIM(RTRIM(@Reason)), 250));

  -- Los pagos abiertos (pendiente o en revisión) se cierran y cada uno deja su rastro en el historial
  DECLARE @Closed TABLE (IDPayment INT PRIMARY KEY, IDPreviousStatus TINYINT NOT NULL);
  -- IX_Payments_Order fuerza buscar solo los pagos de este pedido: sin él el optimizador recorre el índice por estado y choca con las filas sin confirmar de otros pedidos (deadlock que mostró la prueba de concurrencia)
  UPDATE p SET IDPaymentStatus = @OpenPaymentStatus, ResolvedAt = @Now
  OUTPUT inserted.IDPayment, deleted.IDPaymentStatus INTO @Closed (IDPayment, IDPreviousStatus)
  FROM dbo.Payments AS p WITH (INDEX(IX_Payments_Order))
  WHERE p.IDOrder = @IDOrder AND p.IDPaymentStatus IN (1, 2);

  INSERT INTO dbo.PaymentStatusHistory (IDPayment, IDPreviousStatus, IDNewStatus, IDUser, Source, CreatedAt, Comment)
  SELECT IDPayment, IDPreviousStatus, @OpenPaymentStatus, @IDUser, @Source, @Now, LEFT(LTRIM(RTRIM(@Reason)), 250) FROM @Closed;

  -- La reserva vuelve al stock disponible. Las variantes se bloquean en orden ascendente, igual que en la reserva y en la
  -- confirmación del pago, para que ningún par de procedimientos pueda esperarse en círculo.
  DECLARE @IDReservation INT = (SELECT TOP (1) IDReservation FROM dbo.Reservations WHERE IDOrder = @IDOrder AND Status = N'Active');
  IF @IDReservation IS NOT NULL
  BEGIN
    DECLARE @ToLock TABLE (IDVariant INT PRIMARY KEY);
    INSERT INTO @ToLock (IDVariant) SELECT IDVariant FROM dbo.ReservationLines WHERE IDReservation = @IDReservation;
    DECLARE @IDVariant INT = 0, @Locked INT;
    WHILE 1 = 1
    BEGIN
      SELECT TOP (1) @IDVariant = IDVariant FROM @ToLock WHERE IDVariant > @IDVariant ORDER BY IDVariant;
      IF @@ROWCOUNT = 0 BREAK;
      SELECT @Locked = IDVariant FROM dbo.Variants WITH (UPDLOCK, ROWLOCK) WHERE IDVariant = @IDVariant;
    END;

    UPDATE v SET ReservedStock = v.ReservedStock - l.Quantity
    FROM dbo.Variants AS v WITH (UPDLOCK, ROWLOCK)
    JOIN dbo.ReservationLines AS l ON l.IDVariant = v.IDVariant AND l.IDReservation = @IDReservation;

    UPDATE dbo.Reservations SET Status = N'Released' WHERE IDReservation = @IDReservation;
  END;

  -- El cupón usado vuelve a estar disponible: se anula el uso y se devuelve al contador
  IF @IDCoupon IS NOT NULL
  BEGIN
    UPDATE dbo.CouponUsages SET IsVoided = 1 WHERE IDOrder = @IDOrder AND IsVoided = 0;
    IF @@ROWCOUNT > 0
      UPDATE dbo.Coupons SET UsageCount = UsageCount - 1 WHERE IDCoupon = @IDCoupon AND UsageCount > 0;
  END;

  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDOrder AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Orders', @EntityName = N'Order', @EntityKey = @EntityKey, @Action = N'StatusChange',
       @PreviousValue = N'{"IDOrderStatus":1}', @NewValue = N'{"IDOrderStatus":6}', @IDUser = @IDUser;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
