/* =====================================================================
   Objeto   : dbo.SP_Orders_GetDetail
   Version  : 1.0.0
   Cambio   : Primera versión: detalle de un pedido con sus líneas y su historial de estados
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Una sola fila; Lines e History son arreglos JSON. El pedido de otra persona responde igual que uno
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

  SELECT o.IDOrder, o.OrderNumber, o.IDUser, CustomerName = u.FullName, CustomerEmail = u.Email,
         o.IDOrderStatus, StatusName = s.Name, o.CouponCode,
         o.DeliveryRecipient, o.DeliveryPhone, o.DeliveryLine1, o.DeliveryMunicipality, o.DeliveryDepartment,
         o.RequestedDeliveryDate,
         Subtotal = CAST(o.Subtotal AS VARCHAR(25)), Discount = CAST(o.Discount AS VARCHAR(25)),
         Shipping = CAST(o.Shipping AS VARCHAR(25)), Total = CAST(o.Total AS VARCHAR(25)),
         TaxableBase = CAST(o.TaxableBase AS VARCHAR(25)), Vat = CAST(o.Vat AS VARCHAR(25)),
         o.CreatedAt, o.PaidAt,
         Lines = ISNULL((SELECT l.IDOrderLine, l.IDVariant, l.SKU, l.ProductName, l.Attributes, l.Quantity,
                                UnitPrice = CAST(l.UnitPrice AS VARCHAR(25)), LineDiscount = CAST(l.LineDiscount AS VARCHAR(25)),
                                LineTotal = CAST(l.LineTotal AS VARCHAR(25)), l.ReturnedQuantity, l.Inscription
                         FROM dbo.OrderLines AS l WITH (INDEX(IX_OrderLines_Order))
                         WHERE l.IDOrder = o.IDOrder ORDER BY l.IDOrderLine FOR JSON PATH), N'[]'),
         History = ISNULL((SELECT h.IDPreviousStatus, h.IDNewStatus, NewStatusName = ns.Name, h.CreatedAt, h.Comment
                           FROM dbo.OrderStatusHistory AS h
                           JOIN dbo.OrderStatuses AS ns ON ns.IDOrderStatus = h.IDNewStatus
                           WHERE h.IDOrder = o.IDOrder ORDER BY h.IDOrderStatusHistory FOR JSON PATH), N'[]')
  FROM dbo.Orders AS o
  JOIN dbo.Users AS u ON u.IDUser = o.IDUser
  JOIN dbo.OrderStatuses AS s ON s.IDOrderStatus = o.IDOrderStatus
  WHERE o.IDOrder = @IDOrder;
END;
GO
