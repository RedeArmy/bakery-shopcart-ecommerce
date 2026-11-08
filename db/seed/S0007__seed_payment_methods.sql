/* =====================================================================
   Semilla : S0007 · Métodos de pago que ve el cliente
   Contenido : La clase y el texto de la tarjeta y del depósito, y el efectivo o contra entrega (solo en sucursal)
   Nota      : Idempotente. Solo completa lo que falta: nunca pisa un texto ni una configuración que el administrador cambió.
   ===================================================================== */
SET NOCOUNT ON;
-- cspell:disable

-- La clase es técnica (decide cómo se procesa el pago), así que se fija siempre
UPDATE dbo.PaymentMethods SET Kind = N'Card' WHERE IDPaymentMethod = 1 AND Kind <> N'Card';
UPDATE dbo.PaymentMethods SET Kind = N'Deposit' WHERE IDPaymentMethod = 2 AND Kind <> N'Deposit';

-- Los textos solo se completan si no tienen ninguno
UPDATE dbo.PaymentMethods SET Title = N'Tarjeta de débito o crédito', Description = N'Visa o MasterCard'
WHERE IDPaymentMethod = 1 AND Title IS NULL;
UPDATE dbo.PaymentMethods SET Title = N'Depósito o transferencia bancaria',
       Description = N'Deposite o transfiera a una de nuestras cuentas y suba su comprobante para que una persona lo revise.'
WHERE IDPaymentMethod = 2 AND Title IS NULL;

IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE IDPaymentMethod = 3)
  INSERT INTO dbo.PaymentMethods (IDPaymentMethod, Code, Name, Kind, Title, Description, AppliesToDelivery, AppliesToPickup)
  VALUES (3, N'CASH_ON_PICKUP', N'CashOnPickup', N'Cash', N'Efectivo o contra entrega',
          N'Pague en la sucursal al recoger su pedido. Solo está disponible para recogidas.', 0, 1);
GO
