/* =====================================================================
   Objeto   : dbo.SP_Payments_RegisterOrphanPayment
   Version  : 1.0.0
   Cambio   : Primera versión: registra un reembolso pendiente por un pago recibido cuando el pedido ya no estaba vigente
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Es idempotente: un aviso repetido del mismo pago no duplica el reembolso. Errores: 50400, 50404.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Payments_RegisterOrphanPayment
  @IDPayment      INT,
  @ReceivedAmount DECIMAL(18,2),
  @Now            DATETIME2(3) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @IDPayment IS NULL OR @ReceivedAmount IS NULL OR @ReceivedAmount <= 0
    THROW 50400, 'IDPayment and a ReceivedAmount above zero are required.', 1;

  SET @Now = ISNULL(@Now, SYSUTCDATETIME());

  IF NOT EXISTS (SELECT 1 FROM dbo.Payments WHERE IDPayment = @IDPayment)
    THROW 50404, 'Payment not found.', 1;

  -- Un webhook se entrega más de una vez: el segundo aviso del mismo pago no abre otro reembolso. El pedido no se toca;
  -- el reembolso queda visible para el administrador, que decide cómo devolver el dinero.
  IF NOT EXISTS (SELECT 1 FROM dbo.Refunds WHERE IDPayment = @IDPayment AND IDReturn IS NULL AND Status = N'Pending')
    INSERT INTO dbo.Refunds (IDPayment, IDReturn, Amount, Reason, Status, CreatedAt)
    VALUES (@IDPayment, NULL, @ReceivedAmount, N'Payment received after the order was cancelled or expired', N'Pending', @Now);
END;
GO
