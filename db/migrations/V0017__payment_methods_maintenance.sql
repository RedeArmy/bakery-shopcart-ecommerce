/* =====================================================================
   Migración : V0017__payment_methods_maintenance
   Cambio    : Mantenimiento de métodos de pago. Cada método lleva su clase (tarjeta, depósito o efectivo), el texto que ve el
               cliente, si está activo y para qué forma de recibir el pedido se ofrece (entrega a domicilio, recogida o ambas).
               El efectivo o contra entrega solo existe para recogidas en sucursal. Además el depósito ya no se hace en una cuenta
               elegida en el checkout: las cuentas se muestran como información y el depósito no guarda cuál se usó.
   Forward   : Solo agrega columnas con valores por defecto y relaja a NULL la cuenta de un depósito; ningún dato existente cambia.
               Los datos de los métodos (clase, textos, el efectivo) los pone la semilla S0007.
   ===================================================================== */

ALTER TABLE dbo.PaymentMethods ADD
  Kind              NVARCHAR(10)  NOT NULL CONSTRAINT DF_PaymentMethods_Kind DEFAULT N'Deposit',
  Title             NVARCHAR(80)  NULL,
  Description       NVARCHAR(300) NULL,
  AppliesToDelivery BIT           NOT NULL CONSTRAINT DF_PaymentMethods_AppliesToDelivery DEFAULT 1,
  AppliesToPickup   BIT           NOT NULL CONSTRAINT DF_PaymentMethods_AppliesToPickup DEFAULT 1,
  IsActive          BIT           NOT NULL CONSTRAINT DF_PaymentMethods_IsActive DEFAULT 1,
  UpdatedAt         DATETIME2(3)  NULL;
GO

ALTER TABLE dbo.PaymentMethods ADD
  CONSTRAINT CK_PaymentMethods_Kind CHECK (Kind IN (N'Card', N'Deposit', N'Cash')),
  -- Un método que no se ofrece para nada no tiene sentido; se desactiva con IsActive
  CONSTRAINT CK_PaymentMethods_Applies CHECK (AppliesToDelivery = 1 OR AppliesToPickup = 1),
  -- El efectivo se cobra en la sucursal: no hay quien lo reciba en una entrega a domicilio
  CONSTRAINT CK_PaymentMethods_CashPickupOnly CHECK (Kind <> N'Cash' OR (AppliesToDelivery = 0 AND AppliesToPickup = 1));
GO

-- Con las cuentas solo informativas, el depósito no sabe en cuál se hizo: la boleta sigue siendo única entre los depósitos vigentes
-- (en un índice único los NULL cuentan como iguales, así que la referencia queda única sin importar la cuenta)
ALTER TABLE dbo.PaymentDeposits ALTER COLUMN IDBankAccount INT NULL;
GO
