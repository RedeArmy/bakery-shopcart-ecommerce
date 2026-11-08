/* =====================================================================
   Objeto   : dbo.FU_Orders_PaymentEvents
   Version  : 1.0.0
   Cambio   : Primera versión: los momentos del pago de un pedido que el cliente ve en su historial
   Autor    : Equipo ShopCart   Fecha: 2026-11-08
   Compat   : Nueva. Una fila por cada vez que un comprobante pasó a revisión (PaymentUnderReview) o un depósito se rechazó (PaymentRejected),
              con su fecha. No son estados del pedido: se mezclan con su historial para que se vea que el pedido sigue pendiente de
              pago pero ya hay un comprobante por verificar.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Orders_PaymentEvents (@IDOrder INT)
RETURNS TABLE
AS
RETURN
  SELECT NewStatusName = CASE ph.IDNewStatus WHEN 2 THEN N'PaymentUnderReview' ELSE N'PaymentRejected' END, ph.CreatedAt
  FROM dbo.Payments AS p WITH (INDEX(IX_Payments_Order))
  JOIN dbo.PaymentStatusHistory AS ph ON ph.IDPayment = p.IDPayment
  WHERE p.IDOrder = @IDOrder AND ph.IDNewStatus IN (2, 4);
GO
