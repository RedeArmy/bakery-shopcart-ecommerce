/* =====================================================================
   Objeto   : dbo.SP_Payments_ExpirePending
   Version  : 1.0.0
   Cambio   : Primera versión: vence los pagos pendientes que pasaron su plazo y cancela sus pedidos (la ejecutará el job)
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. @Expired devuelve cuántos pedidos canceló. Un pago en revisión NUNCA vence: lo resuelve un operador.
              Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_ExpirePending
  @Now       DATETIME2(3) = NULL,
  -- Tope por ejecución: si hay un atraso enorme el job termina y la siguiente ejecución sigue
  @BatchSize INT          = 100,
  @Expired   INT          = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @BatchSize < 1 OR @BatchSize > 1000
    THROW 50400, 'BatchSize must be between 1 and 1000.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());
  SET @Expired = 0;

  DECLARE @IDOrder INT, @Processed INT = 0;

  -- 1. Pedidos con un pago pendiente vencido. Se procesa un pedido por vez, cada uno en su propia transacción: un fallo no
  --    bloquea al resto, y READPAST deja que una segunda ejecución simultánea tome otros pedidos en vez de esperar.
  WHILE @Processed < @BatchSize
  BEGIN
    SET @IDOrder = NULL;
    SELECT TOP (1) @IDOrder = p.IDOrder
    FROM dbo.Payments AS p WITH (UPDLOCK, READPAST, ROWLOCK)
    JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
    WHERE p.IDPaymentStatus = 1 AND p.ExpiresAt <= @Now AND o.IDOrderStatus = 1
    ORDER BY p.ExpiresAt, p.IDPayment;

    IF @IDOrder IS NULL BREAK;

    EXEC dbo.SP_Orders_CancelPending @IDOrder = @IDOrder, @OpenPaymentStatus = 6, @Reason = N'Payment window elapsed',
         @Source = N'Job', @IDUser = NULL, @Now = @Now;
    SET @Expired += 1;
    SET @Processed += 1;
  END;

  -- 2. Pedidos sin ningún pago abierto cuya reserva venció: el depósito fue rechazado y el cliente no volvió a intentarlo
  WHILE @Processed < @BatchSize
  BEGIN
    SET @IDOrder = NULL;
    SELECT TOP (1) @IDOrder = o.IDOrder
    FROM dbo.Orders AS o
    JOIN dbo.Reservations AS r ON r.IDOrder = o.IDOrder AND r.Status = N'Active'
    WHERE o.IDOrderStatus = 1 AND r.ExpiresAt <= @Now
      AND NOT EXISTS (SELECT 1 FROM dbo.Payments AS p WITH (INDEX(IX_Payments_Order)) WHERE p.IDOrder = o.IDOrder AND p.IDPaymentStatus IN (1, 2))
    ORDER BY r.ExpiresAt, o.IDOrder;

    IF @IDOrder IS NULL BREAK;

    EXEC dbo.SP_Orders_CancelPending @IDOrder = @IDOrder, @OpenPaymentStatus = 6, @Reason = N'Deposit window elapsed without a new attempt',
         @Source = N'Job', @IDUser = NULL, @Now = @Now;
    SET @Expired += 1;
    SET @Processed += 1;
  END;
END;
GO
