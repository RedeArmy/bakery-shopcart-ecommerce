/* =====================================================================
   Objeto   : dbo.SP_Orders_CreateOrder
   Version  : 1.0.0
   Cambio   : Primera versión: crea el pedido en PendingPayment, atómico, a partir de una reserva activa (ADR-0014)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. El backend NO envía importes: todo se recalcula aquí en centavos enteros. Es idempotente por llave: repetir
              la llamada con la misma llave y la misma reserva devuelve el mismo pedido. Errores: 50400 parámetros,
              50404 reserva, dirección o cuenta inexistentes o ajenas, 50409 reserva vencida, cupón agotado, existencias o llave
              repetida, 50422 reglas de negocio. Los mensajes de cupón, reserva y depósito empiezan por el código de la API.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Orders_CreateOrder
  @IDUser                INT,
  @IDReservation         INT,
  @IDAddress             INT,
  @RequestedDeliveryDate DATE,
  -- 1 tarjeta, 2 depósito bancario
  @IDPaymentMethod       TINYINT,
  -- La llave de la solicitud (Idempotency-Key): queda en Payments, donde un índice único es la segunda línea de defensa
  @IdempotencyKey        NVARCHAR(64),
  @IDBankAccount         INT           = NULL,
  @Now                   DATETIME2(3)  = NULL,
  @IDOrder               INT           = NULL OUTPUT,
  @IDPayment             INT           = NULL OUTPUT,
  @OrderNumber           NVARCHAR(20)  = NULL OUTPUT,
  @PaymentExpiresAt      DATETIME2(3)  = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDUser IS NULL OR @IDReservation IS NULL OR @IDAddress IS NULL OR @RequestedDeliveryDate IS NULL OR @IDPaymentMethod IS NULL
     OR ISNULL(@IdempotencyKey, N'') = N''
    THROW 50400, 'IDUser, IDReservation, IDAddress, RequestedDeliveryDate, IDPaymentMethod and IdempotencyKey are required.', 1;
  IF @IDPaymentMethod NOT IN (1, 2)
    THROW 50400, 'IDPaymentMethod must be 1 (card) or 2 (bank deposit).', 1;
  IF @IDPaymentMethod = 2 AND @IDBankAccount IS NULL
    THROW 50400, 'A bank account is required for a deposit.', 1;
  IF @IDPaymentMethod = 1 AND @IDBankAccount IS NOT NULL
    THROW 50400, 'A card payment takes no bank account.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  DECLARE @OwnsTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @OwnsTransaction = 1 BEGIN TRANSACTION;

  -- 1. La reserva. El bloqueo serializa dos solicitudes sobre la misma reserva (doble clic): la segunda ve el pedido de la primera.
  --    La pertenencia va en la misma condición, así que la reserva de otra persona responde como una inexistente.
  DECLARE @IDCart INT, @ReservationStatus NVARCHAR(12), @ReservationExpiresAt DATETIME2(3), @ReservationOrder INT;
  SELECT @IDCart = IDCart, @ReservationStatus = Status, @ReservationExpiresAt = ExpiresAt, @ReservationOrder = IDOrder
  FROM dbo.Reservations WITH (UPDLOCK, ROWLOCK)
  WHERE IDReservation = @IDReservation AND IDUser = @IDUser;

  IF @IDCart IS NULL
    THROW 50404, 'Reservation not found.', 1;

  IF @ReservationOrder IS NOT NULL
  BEGIN
    -- Repetir la creación con la misma llave devuelve el mismo pedido: la idempotencia no depende solo del middleware.
    -- Se usan variables locales y no los parámetros de salida: un parámetro de salida llega con el valor que el llamador
    -- tuviera de una llamada anterior, así que preguntar si es NULL no dice si esta búsqueda encontró algo.
    DECLARE @ReplayPayment INT, @ReplayNumber NVARCHAR(20), @ReplayExpiresAt DATETIME2(3);
    SELECT @ReplayPayment = p.IDPayment, @ReplayNumber = o.OrderNumber, @ReplayExpiresAt = p.ExpiresAt
    FROM dbo.Payments AS p JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
    WHERE p.IDOrder = @ReservationOrder AND p.IdempotencyKey = @IdempotencyKey;

    IF @ReplayPayment IS NULL
      THROW 50409, 'The reservation already belongs to another order.', 1;

    SET @IDOrder = @ReservationOrder;
    SET @IDPayment = @ReplayPayment;
    SET @OrderNumber = @ReplayNumber;
    SET @PaymentExpiresAt = @ReplayExpiresAt;

    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
    RETURN;
  END;

  IF @ReservationStatus <> N'Active' OR @ReservationExpiresAt <= @Now
    THROW 50409, 'RESERVATION_EXPIRED: The reservation is no longer valid.', 1;

  -- El carrito debe seguir siendo el que se reservó. Cambiarlo ya libera la reserva, así que esto es una red de seguridad.
  IF NOT EXISTS (SELECT 1 FROM dbo.Carts WHERE IDCart = @IDCart AND IDUser = @IDUser AND Status = N'Active')
     OR EXISTS (SELECT IDVariant, Quantity FROM dbo.CartItems WHERE IDCart = @IDCart
                EXCEPT SELECT IDVariant, Quantity FROM dbo.ReservationLines WHERE IDReservation = @IDReservation)
     OR EXISTS (SELECT IDVariant, Quantity FROM dbo.ReservationLines WHERE IDReservation = @IDReservation
                EXCEPT SELECT IDVariant, Quantity FROM dbo.CartItems WHERE IDCart = @IDCart)
    THROW 50409, 'RESERVATION_EXPIRED: The cart changed after the reservation.', 1;

  -- Una variante retirada del catálogo después de reservar ya no se puede vender
  IF EXISTS (SELECT 1 FROM dbo.CartItems AS ci CROSS APPLY dbo.FU_Catalogue_CurrentPrice(ci.IDVariant) AS cp
             WHERE ci.IDCart = @IDCart AND cp.IsAvailable = 0)
    THROW 50409, 'INSUFFICIENT_STOCK: One or more units are no longer available.', 1;

  -- 2. La dirección propia y la fecha de entrega, que no puede ser anterior a la anticipación del producto más exigente
  DECLARE @Recipient NVARCHAR(120), @Phone NVARCHAR(20), @Line1 NVARCHAR(200), @Municipality NVARCHAR(80), @Department NVARCHAR(80);
  SELECT @Recipient = Recipient, @Phone = Phone, @Line1 = Line1, @Municipality = Municipality, @Department = Department
  FROM dbo.Addresses WHERE IDAddress = @IDAddress AND IDUser = @IDUser AND IsActive = 1;
  IF @Recipient IS NULL
    THROW 50404, 'Address not found.', 1;

  DECLARE @MaxLeadDays INT = (
    SELECT MAX(CAST(p.LeadTimeDays AS INT))
    FROM dbo.CartItems AS ci JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant JOIN dbo.Products AS p ON p.IDProduct = v.IDProduct
    WHERE ci.IDCart = @IDCart);
  DECLARE @LocalToday DATE = CAST(((@Now AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') AS DATE);
  IF @RequestedDeliveryDate < DATEADD(DAY, @MaxLeadDays, @LocalToday)
    THROW 50422, 'DELIVERY_DATE_TOO_SOON: The requested delivery date is earlier than the lead time of the products allows.', 1;

  -- 3. El plazo del pago. Con tarjeta, la ventana de la reserva; con depósito, la que deja la fecha de entrega (ADR-0016).
  IF @IDPaymentMethod = 2
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.BankAccounts WHERE IDBankAccount = @IDBankAccount AND IsActive = 1)
      THROW 50404, 'Bank account not found.', 1;

    DECLARE @MinutesAvailable INT;
    SELECT @PaymentExpiresAt = DeadlineAt, @MinutesAvailable = MinutesAvailable
    FROM dbo.FU_Payments_DepositWindow(@RequestedDeliveryDate, @MaxLeadDays, @Now);
    IF @MinutesAvailable < ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'MinDepositHours'), 2) * 60
      THROW 50422, 'DEPOSIT_UNAVAILABLE_FOR_DATE: Too little time remains before the delivery date to pay by deposit.', 1;
  END
  ELSE
    SET @PaymentExpiresAt = DATEADD(MINUTE, ISNULL((SELECT TRY_CAST(SettingValue AS INT) FROM dbo.Configuration WHERE SettingKey = N'ReservationMinutes'), 15), @Now);

  -- 4. El cupón. El límite por cliente se valida bajo un bloqueo de aplicación (cliente y cupón) y el total con un UPDATE condicional
  --    más abajo. Un cupón que dejó de valer se rechaza con su código: cobrar de más en silencio sería peor que avisar.
  DECLARE @IDCoupon INT = (SELECT IDCoupon FROM dbo.Carts WHERE IDCart = @IDCart), @CouponCode NVARCHAR(30);
  DECLARE @Allocation TABLE (IDCartItem INT PRIMARY KEY, DiscountCents BIGINT NOT NULL);

  IF @IDCoupon IS NOT NULL
  BEGIN
    DECLARE @LockResource NVARCHAR(100) = CONCAT(N'Coupon:', @IDCoupon, N':', @IDUser), @LockResult INT;
    EXEC @LockResult = sp_getapplock @Resource = @LockResource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 5000;
    IF @LockResult < 0
      THROW 50409, 'The coupon is being used by another request; retry.', 1;

    DECLARE @Eligible BIGINT = ISNULL((SELECT MAX(EligibleCents) FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @IDCoupon)), 0);
    DECLARE @Reason VARCHAR(20) = (SELECT Reason FROM dbo.FU_Coupons_Status(@IDCoupon, @IDUser, @Eligible, @Now));
    IF @Reason <> 'Valid'
    BEGIN
      DECLARE @ErrorNumber INT, @ErrorMessage NVARCHAR(200);
      SELECT @ErrorNumber = ErrorNumber, @ErrorMessage = Message FROM dbo.FU_Coupons_Rejection(@Reason);
      THROW @ErrorNumber, @ErrorMessage, 1;
    END;

    INSERT INTO @Allocation (IDCartItem, DiscountCents)
    SELECT IDCartItem, DiscountCents FROM dbo.FU_Coupons_DiscountCalculation(@IDCart, @IDCoupon);
  END;

  -- 5. Los importes, siempre recalculados aquí y SIEMPRE ANTES de contar el uso del cupón: al contarlo, un cupón de un solo uso
  --    pasaría a "agotado" y FU_Cart_Totals dejaría de aplicarle su propio descuento
  DECLARE @SubtotalCents BIGINT, @DiscountCents BIGINT, @TotalCents BIGINT, @VatCents BIGINT, @BaseCents BIGINT;
  SELECT @SubtotalCents = SubtotalCents, @DiscountCents = DiscountCents, @TotalCents = TotalCents, @VatCents = VatCents, @BaseCents = BaseCents
  FROM dbo.FU_Cart_Totals(@IDCart, @Now);

  -- Un pago de cero no existe (CK_Payments_Amount): un cupón que cubra todo el carrito no se admite como pedido
  IF @TotalCents <= 0
    THROW 50422, 'The order total must be greater than zero.', 1;

  IF @IDCoupon IS NOT NULL
  BEGIN
    -- Cupón concurrente: el UPDATE condicional es atómico, así que dos pedidos que se disputan el último uso no pasan los dos
    UPDATE dbo.Coupons SET UsageCount = UsageCount + 1
    WHERE IDCoupon = @IDCoupon AND IsActive = 1 AND @Now BETWEEN StartsAt AND EndsAt
      AND (TotalUsageLimit IS NULL OR UsageCount < TotalUsageLimit);
    IF @@ROWCOUNT = 0
      THROW 50409, 'COUPON_EXHAUSTED: The coupon has reached its usage limit.', 1;
    SET @CouponCode = (SELECT Code FROM dbo.Coupons WHERE IDCoupon = @IDCoupon);
  END;

  DECLARE @Subtotal DECIMAL(18,2) = CAST(CAST(@SubtotalCents AS DECIMAL(20,2)) / 100 AS DECIMAL(18,2));
  DECLARE @Discount DECIMAL(18,2) = CAST(CAST(@DiscountCents AS DECIMAL(20,2)) / 100 AS DECIMAL(18,2));
  DECLARE @Total DECIMAL(18,2) = CAST(CAST(@TotalCents AS DECIMAL(20,2)) / 100 AS DECIMAL(18,2));
  DECLARE @Vat DECIMAL(18,2) = CAST(CAST(@VatCents AS DECIMAL(20,2)) / 100 AS DECIMAL(18,2));
  DECLARE @TaxableBase DECIMAL(18,2) = CAST(CAST(@BaseCents AS DECIMAL(20,2)) / 100 AS DECIMAL(18,2));

  -- 6. El pedido. El número tiene el formato PED-AAAA-NNNNNN y sale del identificador, que no se conoce hasta insertar: se
  --    inserta con un valor provisional único y se completa enseguida. No hay envío: el enunciado no lo pide, así que se guarda cero.
  INSERT INTO dbo.Orders
    (OrderNumber, IDUser, IDOrderStatus, IDCoupon, CouponCode, DeliveryRecipient, DeliveryPhone, DeliveryLine1,
     DeliveryMunicipality, DeliveryDepartment, RequestedDeliveryDate, Subtotal, Discount, Shipping, Total, TaxableBase, Vat, CreatedAt)
  VALUES
    (CONCAT(N'TMP-', LEFT(REPLACE(CAST(NEWID() AS NVARCHAR(36)), N'-', N''), 16)), @IDUser, 1, @IDCoupon, @CouponCode, @Recipient, @Phone, @Line1,
     @Municipality, @Department, @RequestedDeliveryDate, @Subtotal, @Discount, 0, @Total, @TaxableBase, @Vat, @Now);
  SET @IDOrder = SCOPE_IDENTITY();

  SET @OrderNumber = CONCAT(N'PED-', DATEPART(YEAR, @LocalToday), N'-',
                            CASE WHEN @IDOrder < 1000000 THEN RIGHT(CONCAT(N'000000', @IDOrder), 6) ELSE CAST(@IDOrder AS NVARCHAR(10)) END);
  UPDATE dbo.Orders SET OrderNumber = @OrderNumber WHERE IDOrder = @IDOrder;

  -- Las líneas guardan lo que se vendió (SKU, nombre, atributos, precio) y su parte del descuento, repartido por mayor resto
  DECLARE @InsertedLines TABLE (LineTotal DECIMAL(18,2) NOT NULL);
  INSERT INTO dbo.OrderLines (IDOrder, IDVariant, IDCategory, SKU, ProductName, Attributes, Quantity, UnitPrice, LineDiscount, LineTotal, Inscription)
  OUTPUT inserted.LineTotal INTO @InsertedLines (LineTotal)
  SELECT @IDOrder, v.IDVariant, p.IDCategory, v.SKU, p.Name, LEFT(ISNULL(attr.Text, N''), 200), ci.Quantity, v.Price,
         x.LineDiscount, ci.Quantity * v.Price - x.LineDiscount, ci.Inscription
  FROM dbo.CartItems AS ci
  JOIN dbo.Variants AS v ON v.IDVariant = ci.IDVariant
  JOIN dbo.Products AS p ON p.IDProduct = v.IDProduct
  LEFT JOIN @Allocation AS a ON a.IDCartItem = ci.IDCartItem
  CROSS APPLY (SELECT LineDiscount = CAST(CAST(ISNULL(a.DiscountCents, 0) AS DECIMAL(20,2)) / 100 AS DECIMAL(18,2))) AS x
  OUTER APPLY (
    SELECT Text = STRING_AGG(CONCAT(at.Name, N': ', va.Value), N'; ') WITHIN GROUP (ORDER BY at.Name)
    FROM dbo.VariantAttributes AS va JOIN dbo.Attributes AS at ON at.IDAttribute = va.IDAttribute
    WHERE va.IDVariant = v.IDVariant
  ) AS attr
  WHERE ci.IDCart = @IDCart;

  -- Guarda contra un error de este procedimiento: las líneas deben sumar exactamente lo que el encabezado dice. Se suma lo
  -- que el INSERT acaba de devolver y no se relee OrderLines: con la tabla pequeña el optimizador la recorre entera y choca
  -- con las filas sin confirmar de otros pedidos simultáneos, lo que producía deadlocks (la prueba de concurrencia lo mostró).
  IF (SELECT SUM(LineTotal) FROM @InsertedLines) <> @Subtotal - @Discount
    THROW 50422, 'The order lines do not add up to the order total.', 1;

  IF @IDCoupon IS NOT NULL
    INSERT INTO dbo.CouponUsages (IDCoupon, IDUser, IDOrder, DiscountAmount, CreatedAt) VALUES (@IDCoupon, @IDUser, @IDOrder, @Discount, @Now);

  -- 7. El pago, en Pending. Su llave tiene un índice único: si otra solicitud con la misma llave llega a otra reserva, aquí choca.
  BEGIN TRY
    INSERT INTO dbo.Payments (IDOrder, IDPaymentMethod, IDPaymentStatus, Amount, IdempotencyKey, ExpiresAt, CreatedAt)
    VALUES (@IDOrder, @IDPaymentMethod, 1, @Total, @IdempotencyKey, @PaymentExpiresAt, @Now);
    SET @IDPayment = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627) THROW 50409, 'IDEMPOTENCY_KEY_IN_USE: The key was already used for another order.', 1;
    THROW;
  END CATCH;

  IF @IDPaymentMethod = 2
    INSERT INTO dbo.PaymentDeposits (IDPayment, IDBankAccount) VALUES (@IDPayment, @IDBankAccount);

  INSERT INTO dbo.PaymentStatusHistory (IDPayment, IDPreviousStatus, IDNewStatus, IDUser, Source, CreatedAt, Comment)
  VALUES (@IDPayment, NULL, 1, @IDUser, N'Customer', @Now, N'Payment created with the order');
  INSERT INTO dbo.OrderStatusHistory (IDOrder, IDPreviousStatus, IDNewStatus, IDUser, CreatedAt, Comment)
  VALUES (@IDOrder, NULL, 1, @IDUser, @Now, N'Order created');

  -- 8. La reserva pasa a ser del pedido y vence cuando vence el pago. No hay movimiento de inventario ni baja de la existencia
  --    física: eso ocurre al confirmarse el pago, y un pedido abandonado no deja ruido en el libro.
  UPDATE dbo.Reservations SET IDOrder = @IDOrder, ExpiresAt = @PaymentExpiresAt WHERE IDReservation = @IDReservation;
  UPDATE dbo.Carts SET Status = N'Converted', LastActivityAt = @Now WHERE IDCart = @IDCart;

  DECLARE @New NVARCHAR(MAX) = (
    SELECT o.IDOrder, o.OrderNumber, o.IDCoupon, o.CouponCode, Subtotal = CAST(o.Subtotal AS VARCHAR(25)), Discount = CAST(o.Discount AS VARCHAR(25)),
           Total = CAST(o.Total AS VARCHAR(25)), o.RequestedDeliveryDate, IDPaymentMethod = @IDPaymentMethod, IDPayment = @IDPayment
    FROM dbo.Orders AS o WHERE o.IDOrder = @IDOrder
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
  DECLARE @EntityKey NVARCHAR(40) = CAST(@IDOrder AS NVARCHAR(40));
  EXEC dbo.SP_Audit_Record @Module = N'Orders', @EntityName = N'Order', @EntityKey = @EntityKey, @Action = N'Create',
       @NewValue = @New, @IDUser = @IDUser;

  IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END;
GO
