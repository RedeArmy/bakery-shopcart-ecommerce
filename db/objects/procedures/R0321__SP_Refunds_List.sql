/* =====================================================================
   Objeto   : dbo.SP_Refunds_List
   Version  : 1.0.0
   Cambio   : Primera versión: lista de reembolsos para el panel del administrador
   Autor    : Equipo ShopCart   Fecha: 2026-10-30
   Compat   : Nueva. Sin estado trae todos; los más antiguos primero, porque un reembolso pendiente debe atenderse en orden.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Refunds_List
  @Status NVARCHAR(12) = NULL,
  @Limit  INT          = 100
AS
BEGIN
  SET NOCOUNT ON;

  IF @Status IS NOT NULL AND @Status NOT IN (N'Pending', N'Processed', N'Failed')
    THROW 50400, 'Status must be Pending, Processed or Failed.', 1;
  IF @Limit < 1 OR @Limit > 500
    THROW 50400, 'Limit must be between 1 and 500.', 1;

  SELECT TOP (@Limit)
         r.IDRefund, r.IDPayment, p.IDOrder, o.OrderNumber, r.IDReturn,
         Amount = r.Amount, AmountText = t.Text,
         r.Reason, r.Status, r.ExternalReference, r.CreatedAt, r.ProcessedAt
  FROM dbo.Refunds AS r
  JOIN dbo.Payments AS p ON p.IDPayment = r.IDPayment
  JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder
  CROSS APPLY dbo.FU_Money_CentsToText(CAST(r.Amount * 100 AS BIGINT)) AS t
  WHERE @Status IS NULL OR r.Status = @Status
  ORDER BY r.CreatedAt, r.IDRefund;
END;
GO
