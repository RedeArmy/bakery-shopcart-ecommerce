/* =====================================================================
   Objeto   : dbo.SP_Orders_Track
   Version  : 1.1.0
   Cambio   : Primera versión: consulta pública del estado de un pedido con su número y el correo de quien lo hizo
   Cambio 1.1.0: agrega PaymentStatusName (justo después de StatusName) y mezcla en History los momentos del pago (PaymentUnderReview y
              PaymentRejected).
   Autor    : Equipo ShopCart   Fecha: 2026-11-07
   Compat   : Nueva. No necesita sesión: quien consulta se identifica con algo que solo el cliente conoce (el número que recibió
              y su correo). Devuelve solo el estado, las fechas y la forma de recibirlo: ningún nombre, dirección, producto ni
              importe. Un número que no existe y uno con otro correo responden igual (50404), para que no se pueda adivinar cuáles
              existen. Errores: 50400, 50404.
   ===================================================================== */
CREATE OR ALTER PROCEDURE dbo.SP_Orders_Track
  @OrderNumber NVARCHAR(20),
  @Email       NVARCHAR(254)
AS
BEGIN
  SET NOCOUNT ON;

  SET @OrderNumber = UPPER(LTRIM(RTRIM(@OrderNumber)));
  SET @Email = LTRIM(RTRIM(@Email));
  IF ISNULL(@OrderNumber, N'') = N'' OR ISNULL(@Email, N'') = N''
    THROW 50400, 'OrderNumber and Email are required.', 1;

  DECLARE @IDOrder INT = (
    SELECT o.IDOrder
    FROM dbo.Orders AS o
    JOIN dbo.Users AS u ON u.IDUser = o.IDUser
    WHERE o.OrderNumber = @OrderNumber AND u.Email = @Email);

  IF @IDOrder IS NULL
    THROW 50404, 'Order not found.', 1;

  SELECT o.OrderNumber, StatusName = s.Name,
         PaymentStatusName = (SELECT ps.StatusName FROM dbo.FU_Orders_CurrentPaymentStatus(o.IDOrder) AS ps), o.CreatedAt, o.RequestedDeliveryDate, o.FulfilmentType, o.PickupBranchName,
         History = ISNULL((SELECT x.IDNewStatus, x.NewStatusName, x.CreatedAt
                           FROM (SELECT h.IDNewStatus, NewStatusName = ns.Name, h.CreatedAt
                                 FROM dbo.OrderStatusHistory AS h
                                 JOIN dbo.OrderStatuses AS ns ON ns.IDOrderStatus = h.IDNewStatus
                                 WHERE h.IDOrder = o.IDOrder
                                 UNION ALL
                                 SELECT NULL, e.NewStatusName, e.CreatedAt FROM dbo.FU_Orders_PaymentEvents(o.IDOrder) AS e) AS x
                           ORDER BY x.CreatedAt FOR JSON PATH), N'[]')
  FROM dbo.Orders AS o
  JOIN dbo.OrderStatuses AS s ON s.IDOrderStatus = o.IDOrderStatus
  WHERE o.IDOrder = @IDOrder;
END;
GO
