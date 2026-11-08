/* =====================================================================
   Objeto   : dbo.SP_PaymentMethods_List
   Version  : 1.0.0
   Cambio   : Primera versión: los métodos de pago con su texto y para qué forma de recibir el pedido se ofrecen
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. Por defecto solo los activos. @Fulfilment (Delivery o Pickup) deja los que se ofrecen para esa forma de
              recibirlo. @ManagedOnly = 1 omite la tarjeta, que no se administra aquí (depende de las credenciales del proveedor).
              Errores: 50400.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_PaymentMethods_List
  @IncludeInactive BIT          = 0,
  @Fulfilment      NVARCHAR(10) = NULL,
  @ManagedOnly     BIT          = 0
AS
BEGIN
  SET NOCOUNT ON;

  IF @Fulfilment IS NOT NULL AND @Fulfilment NOT IN (N'Delivery', N'Pickup')
    THROW 50400, 'Fulfilment must be Delivery or Pickup.', 1;

  SELECT m.IDPaymentMethod, m.Code, m.Kind, Title = ISNULL(m.Title, m.Name), m.Description,
         m.AppliesToDelivery, m.AppliesToPickup, m.IsActive
  FROM dbo.PaymentMethods AS m
  WHERE (@IncludeInactive = 1 OR m.IsActive = 1)
    AND (@ManagedOnly = 0 OR m.Kind <> N'Card')
    AND (@Fulfilment IS NULL
         OR (@Fulfilment = N'Delivery' AND m.AppliesToDelivery = 1)
         OR (@Fulfilment = N'Pickup' AND m.AppliesToPickup = 1))
  ORDER BY m.IDPaymentMethod;
END;
GO
