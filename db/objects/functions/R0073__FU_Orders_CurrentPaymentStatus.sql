/* =====================================================================
   Objeto   : dbo.FU_Orders_CurrentPaymentStatus
   Version  : 1.0.0
   Cambio   : Primera versión: el estado del pago más reciente de un pedido
   Autor    : Equipo ShopCart   Fecha: 2026-11-08
   Compat   : Nueva. Una fila con el nombre del estado (Pending, UnderReview, Approved...) o ninguna si el pedido no tiene pagos. El estado
              del pedido y el del pago son independientes (ADR-0015): con esto la pantalla distingue "pendiente de pago" de "comprobante
              recibido, pendiente de verificar" sin cambiar los estados del pedido.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Orders_CurrentPaymentStatus (@IDOrder INT)
RETURNS TABLE
AS
RETURN
  -- IX_Payments_Order fuerza buscar solo los pagos de este pedido (ver SP_Orders_CancelPending)
  SELECT TOP (1) StatusName = s.Name
  FROM dbo.Payments AS p WITH (INDEX(IX_Payments_Order))
  JOIN dbo.PaymentStatuses AS s ON s.IDPaymentStatus = p.IDPaymentStatus
  WHERE p.IDOrder = @IDOrder
  ORDER BY p.IDPayment DESC;
GO
