/* =====================================================================
   Objeto   : dbo.FU_Orders_AllowedActions
   Version  : 1.0.0
   Cambio   : Primera versión: las acciones que se pueden tomar sobre un pedido según su estado, cómo se recibe y quién las toma
   Autor    : Equipo ShopCart   Fecha: 2026-11-09
   Compat   : Nueva. Es la ÚNICA fuente de estas reglas: la usan SP_Orders_ChangeStatus (preparar, despachar y entregar),
              SP_Orders_Cancel, SP_Returns_Register y SP_Orders_GetDetail, que la entrega al API como allowedActions. El frontend
              ya no las repite. Devuelve una fila por cada acción que aplica al estado del pedido, con Allowed = 1 si la persona
              con ese rol puede tomarla, y OperatorOnly = 1 si la acción está reservada a los operadores, para poder explicar
              por qué un administrador no la ve en lugar de esconderla sin más.
   ===================================================================== */
CREATE OR ALTER FUNCTION dbo.FU_Orders_AllowedActions (@IDOrderStatus TINYINT, @FulfilmentType NVARCHAR(10), @IDRole TINYINT)
RETURNS TABLE
AS
RETURN
  SELECT a.Action,
         Allowed = CAST(CASE @IDRole
                          WHEN 2 THEN 1                              -- el operador toma todas
                          WHEN 3 THEN CASE WHEN a.OperatorOnly = 1 THEN 0 ELSE 1 END
                          WHEN 1 THEN a.CustomerCan                  -- el cliente solo cancela, y solo lo suyo (lo comprueba quien llama)
                          ELSE 0
                        END AS BIT),
         OperatorOnly = CAST(a.OperatorOnly AS BIT)
  FROM (VALUES
    -- Estados: 1 PendingPayment, 2 Paid, 3 InPreparation, 4 Dispatched, 5 Delivered, 7 PartiallyReturned
    -- Acción, desde qué estado, para qué entrega (NULL = cualquiera), ¿solo operador?, ¿puede el cliente?
    (N'Prepare',  CAST(2 AS TINYINT), CAST(NULL AS NVARCHAR(10)), 0, 0),
    -- A domicilio el pedido se despacha antes de entregarse; lo que se recoge en sucursal no sale a ninguna parte
    (N'Dispatch', CAST(3 AS TINYINT), N'Delivery',                0, 0),
    (N'Deliver',  CAST(3 AS TINYINT), N'Pickup',                  0, 0),
    -- Quien reparte a domicilio es el operador; el administrador gestiona pero no entrega
    (N'Deliver',  CAST(4 AS TINYINT), N'Delivery',                1, 0),
    -- Despachado en adelante ya salió de la pastelería: solo cabe devolverlo cuando esté entregado
    (N'Cancel',   CAST(1 AS TINYINT), NULL,                       0, 1),
    (N'Cancel',   CAST(2 AS TINYINT), NULL,                       0, 1),
    (N'Cancel',   CAST(3 AS TINYINT), NULL,                       0, 1),
    (N'Return',   CAST(5 AS TINYINT), NULL,                       0, 0),
    (N'Return',   CAST(7 AS TINYINT), NULL,                       0, 0)
  ) AS a (Action, FromStatus, Fulfilment, OperatorOnly, CustomerCan)
  WHERE a.FromStatus = @IDOrderStatus
    AND (a.Fulfilment IS NULL OR a.Fulfilment = @FulfilmentType);
GO
