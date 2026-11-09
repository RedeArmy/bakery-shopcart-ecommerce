/* =====================================================================
   Objeto   : dbo.SP_Orders_GetDetail
   Version  : 1.4.0
   Cambio 1.4.0: agrega AllowedActions (lo que quien pide el detalle puede hacer ahora con el pedido) y OperatorOnlyActions (lo que el
              estado permite pero está reservado a los operadores), ambos arreglos JSON de dbo.FU_Orders_AllowedActions, la fuente
              única de esas reglas.
   Cambio   : Primera versión: detalle de un pedido con sus líneas y su historial de estados
   Cambio 1.1.0: agrega FulfilmentType (Delivery o Pickup) y la sucursal de recogida; la dirección de entrega es NULL en una recogida.
   Cambio 1.2.0: agrega DeliveryNotes, las notas de entrega del cliente (NULL si no escribió ninguna).
   Cambio 1.3.0: agrega PaymentStatusName (justo después de StatusName) y mezcla en History los momentos del pago (PaymentUnderReview y
              PaymentRejected, sin identificador de estado), para que se vea que hay un comprobante por verificar.
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Solo agrega columnas a 1.0.0. Una sola fila; Lines e History son arreglos JSON. El pedido de otra persona responde igual que uno
              inexistente. Errores: 50400, 50404.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Orders_GetDetail
  @IDActor INT,
  @AsStaff BIT = 0,
  @IDOrder INT
AS
BEGIN
  SET NOCOUNT ON;

  IF @IDActor IS NULL OR @IDOrder IS NULL
    THROW 50400, 'IDActor and IDOrder are required.', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE IDOrder = @IDOrder AND (@AsStaff = 1 OR IDUser = @IDActor))
    THROW 50404, 'Order not found.', 1;

  DECLARE @ActorRole TINYINT = (SELECT IDRole FROM dbo.Users WHERE IDUser = @IDActor);

  SELECT o.IDOrder, o.OrderNumber, o.IDUser, CustomerName = u.FullName, CustomerEmail = u.Email,
         o.IDOrderStatus, StatusName = s.Name,
         PaymentStatusName = (SELECT ps.StatusName FROM dbo.FU_Orders_CurrentPaymentStatus(o.IDOrder) AS ps), o.CouponCode,
         o.DeliveryRecipient, o.DeliveryPhone, o.DeliveryLine1, o.DeliveryMunicipality, o.DeliveryDepartment,
         o.RequestedDeliveryDate, o.FulfilmentType, o.IDBranch, o.PickupBranchName, o.PickupBranchAddress, o.DeliveryNotes,
         Subtotal = CAST(o.Subtotal AS VARCHAR(25)), Discount = CAST(o.Discount AS VARCHAR(25)),
         Shipping = CAST(o.Shipping AS VARCHAR(25)), Total = CAST(o.Total AS VARCHAR(25)),
         TaxableBase = CAST(o.TaxableBase AS VARCHAR(25)), Vat = CAST(o.Vat AS VARCHAR(25)),
         o.CreatedAt, o.PaidAt,
         Lines = ISNULL((SELECT l.IDOrderLine, l.IDVariant, l.SKU, l.ProductName, l.Attributes, l.Quantity,
                                UnitPrice = CAST(l.UnitPrice AS VARCHAR(25)), LineDiscount = CAST(l.LineDiscount AS VARCHAR(25)),
                                LineTotal = CAST(l.LineTotal AS VARCHAR(25)), l.ReturnedQuantity, l.Inscription
                         FROM dbo.OrderLines AS l WITH (INDEX(IX_OrderLines_Order))
                         WHERE l.IDOrder = o.IDOrder ORDER BY l.IDOrderLine FOR JSON PATH), N'[]'),
         History = ISNULL((SELECT x.IDPreviousStatus, x.IDNewStatus, x.NewStatusName, x.CreatedAt, x.Comment
                           FROM (SELECT h.IDPreviousStatus, h.IDNewStatus, NewStatusName = ns.Name, h.CreatedAt, h.Comment
                                 FROM dbo.OrderStatusHistory AS h
                                 JOIN dbo.OrderStatuses AS ns ON ns.IDOrderStatus = h.IDNewStatus
                                 WHERE h.IDOrder = o.IDOrder
                                 UNION ALL
                                 SELECT NULL, NULL, e.NewStatusName, e.CreatedAt, NULL FROM dbo.FU_Orders_PaymentEvents(o.IDOrder) AS e) AS x
                           ORDER BY x.CreatedAt FOR JSON PATH), N'[]'),
         AllowedActions = N'[' + ISNULL((SELECT STRING_AGG(CONCAT(N'"', x.Action, N'"'), N',') WITHIN GROUP (ORDER BY x.Action)
                                         FROM dbo.FU_Orders_AllowedActions(o.IDOrderStatus, o.FulfilmentType, @ActorRole) AS x
                                         WHERE x.Allowed = 1), N'') + N']',
         OperatorOnlyActions = N'[' + ISNULL((SELECT STRING_AGG(CONCAT(N'"', x.Action, N'"'), N',') WITHIN GROUP (ORDER BY x.Action)
                                              FROM dbo.FU_Orders_AllowedActions(o.IDOrderStatus, o.FulfilmentType, @ActorRole) AS x
                                              WHERE x.Allowed = 0 AND x.OperatorOnly = 1 AND @ActorRole IN (2, 3)), N'') + N']'
  FROM dbo.Orders AS o
  JOIN dbo.Users AS u ON u.IDUser = o.IDUser
  JOIN dbo.OrderStatuses AS s ON s.IDOrderStatus = o.IDOrderStatus
  WHERE o.IDOrder = @IDOrder;
END;
GO
