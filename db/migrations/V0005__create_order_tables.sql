/* =====================================================================
   Migración : V0005 · Pedidos, estados y cupones usados
   Contenido : OrderStatuses, OrderStatusTransitions, Orders, OrderLines, OrderStatusHistory, CouponUsages
   Nota      : Añade la clave foránea diferida InventoryMovements.IDOrder.
   ===================================================================== */
SET NOCOUNT ON;

-- 1 PendingPayment, 2 Paid, 3 InPreparation, 4 Dispatched, 5 Delivered, 6 Cancelled, 7 PartiallyReturned, 8 Returned
CREATE TABLE dbo.OrderStatuses (
  IDOrderStatus TINYINT      NOT NULL CONSTRAINT PK_OrderStatuses PRIMARY KEY,
  Name          NVARCHAR(30) NOT NULL CONSTRAINT UQ_OrderStatuses_Name UNIQUE
);

-- Las transiciones válidas son datos, no código: el trigger y el procedimiento consultan esta tabla (ADR-0006)
CREATE TABLE dbo.OrderStatusTransitions (
  IDFromStatus TINYINT NOT NULL CONSTRAINT FK_OrderStatusTransitions_From REFERENCES dbo.OrderStatuses (IDOrderStatus),
  IDToStatus   TINYINT NOT NULL CONSTRAINT FK_OrderStatusTransitions_To REFERENCES dbo.OrderStatuses (IDOrderStatus),
  CONSTRAINT PK_OrderStatusTransitions PRIMARY KEY (IDFromStatus, IDToStatus)
);

CREATE TABLE dbo.Orders (
  IDOrder               INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Orders PRIMARY KEY,
  -- Formato PED-2026-000123; es la referencia que el cliente escribe en el depósito
  OrderNumber           NVARCHAR(20)      NOT NULL CONSTRAINT UQ_Orders_OrderNumber UNIQUE,
  IDUser                INT               NOT NULL CONSTRAINT FK_Orders_Users REFERENCES dbo.Users (IDUser),
  IDOrderStatus         TINYINT           NOT NULL CONSTRAINT FK_Orders_OrderStatuses REFERENCES dbo.OrderStatuses (IDOrderStatus),
  IDCoupon              INT               NULL CONSTRAINT FK_Orders_Coupons REFERENCES dbo.Coupons (IDCoupon),
  -- Copia del código: el cupón puede cambiar o desactivarse después y el pedido debe conservar lo que se aplicó
  CouponCode            NVARCHAR(30)      NULL,
  -- Dirección congelada en el pedido, por la misma razón
  DeliveryRecipient     NVARCHAR(120)     NOT NULL,
  DeliveryPhone         NVARCHAR(20)      NOT NULL,
  DeliveryLine1         NVARCHAR(200)     NOT NULL,
  DeliveryMunicipality  NVARCHAR(80)      NOT NULL,
  DeliveryDepartment    NVARCHAR(80)      NOT NULL,
  RequestedDeliveryDate DATE              NOT NULL,
  Subtotal              DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Orders_Subtotal CHECK (Subtotal >= 0),
  Discount              DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Orders_Discount CHECK (Discount >= 0),
  Shipping              DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Orders_Shipping CHECK (Shipping >= 0),
  Total                 DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Orders_TotalNonNegative CHECK (Total >= 0),
  TaxableBase           DECIMAL(18,2)     NOT NULL,
  Vat                   DECIMAL(18,2)     NOT NULL,
  CreatedAt             DATETIME2(3)      NOT NULL CONSTRAINT DF_Orders_CreatedAt DEFAULT SYSUTCDATETIME(),
  PaidAt                DATETIME2(3)      NULL,
  -- Coherencia interna de los montos congelados (ADR-0008, ADR-0019)
  CONSTRAINT CK_Orders_Total CHECK (Total = (CASE WHEN Subtotal - Discount < 0 THEN 0 ELSE Subtotal - Discount END) + Shipping),
  CONSTRAINT CK_Orders_Vat CHECK (TaxableBase + Vat = Total),
  -- Todo pedido que no está pendiente (1) ni cancelado (6) tiene fecha de pago
  CONSTRAINT CK_Orders_PaidAt CHECK (IDOrderStatus IN (1, 6) OR PaidAt IS NOT NULL)
);
CREATE INDEX IX_Orders_User ON dbo.Orders (IDUser, CreatedAt DESC);
CREATE INDEX IX_Orders_Status_CreatedAt ON dbo.Orders (IDOrderStatus, CreatedAt) INCLUDE (Total, IDUser);
-- Los reportes agrupan por fecha de pago (ADR-0009), no por fecha de creación
CREATE INDEX IX_Orders_PaidAt ON dbo.Orders (PaidAt) INCLUDE (Total, IDOrderStatus) WHERE PaidAt IS NOT NULL;

CREATE TABLE dbo.OrderLines (
  IDOrderLine      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OrderLines PRIMARY KEY,
  IDOrder          INT               NOT NULL CONSTRAINT FK_OrderLines_Orders REFERENCES dbo.Orders (IDOrder),
  IDVariant        INT               NOT NULL CONSTRAINT FK_OrderLines_Variants REFERENCES dbo.Variants (IDVariant),
  IDCategory       INT               NOT NULL,
  -- Copias de lo que se vendió: el catálogo puede cambiar sin alterar pedidos pasados
  SKU              NVARCHAR(40)      NOT NULL,
  ProductName      NVARCHAR(150)     NOT NULL,
  Attributes       NVARCHAR(200)     NOT NULL,
  Quantity         INT               NOT NULL CONSTRAINT CK_OrderLines_Quantity CHECK (Quantity > 0),
  UnitPrice        DECIMAL(18,2)     NOT NULL CONSTRAINT CK_OrderLines_UnitPrice CHECK (UnitPrice > 0),
  LineDiscount     DECIMAL(18,2)     NOT NULL CONSTRAINT DF_OrderLines_LineDiscount DEFAULT 0
                                     CONSTRAINT CK_OrderLines_LineDiscount CHECK (LineDiscount >= 0),
  LineTotal        DECIMAL(18,2)     NOT NULL,
  ReturnedQuantity INT               NOT NULL CONSTRAINT DF_OrderLines_ReturnedQuantity DEFAULT 0,
  Inscription      NVARCHAR(60)      NULL,
  CONSTRAINT CK_OrderLines_LineTotal CHECK (LineTotal = Quantity * UnitPrice - LineDiscount),
  -- No se puede devolver más de lo vendido
  CONSTRAINT CK_OrderLines_ReturnedQuantity CHECK (ReturnedQuantity BETWEEN 0 AND Quantity)
);
CREATE INDEX IX_OrderLines_Order ON dbo.OrderLines (IDOrder);

CREATE TABLE dbo.OrderStatusHistory (
  IDOrderStatusHistory BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OrderStatusHistory PRIMARY KEY,
  IDOrder              INT                  NOT NULL CONSTRAINT FK_OrderStatusHistory_Orders REFERENCES dbo.Orders (IDOrder),
  IDPreviousStatus     TINYINT              NULL CONSTRAINT FK_OrderStatusHistory_Previous REFERENCES dbo.OrderStatuses (IDOrderStatus),
  IDNewStatus          TINYINT              NOT NULL CONSTRAINT FK_OrderStatusHistory_New REFERENCES dbo.OrderStatuses (IDOrderStatus),
  -- NULL cuando el cambio lo hace el sistema (job de expiración)
  IDUser               INT                  NULL CONSTRAINT FK_OrderStatusHistory_Users REFERENCES dbo.Users (IDUser),
  CreatedAt            DATETIME2(3)         NOT NULL CONSTRAINT DF_OrderStatusHistory_CreatedAt DEFAULT SYSUTCDATETIME(),
  Comment              NVARCHAR(250)        NULL
);
CREATE INDEX IX_OrderStatusHistory_Order ON dbo.OrderStatusHistory (IDOrder, CreatedAt);

CREATE TABLE dbo.CouponUsages (
  IDCouponUsage  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CouponUsages PRIMARY KEY,
  IDCoupon       INT               NOT NULL CONSTRAINT FK_CouponUsages_Coupons REFERENCES dbo.Coupons (IDCoupon),
  IDUser         INT               NOT NULL CONSTRAINT FK_CouponUsages_Users REFERENCES dbo.Users (IDUser),
  IDOrder        INT               NOT NULL CONSTRAINT FK_CouponUsages_Orders REFERENCES dbo.Orders (IDOrder),
  DiscountAmount DECIMAL(18,2)     NOT NULL CONSTRAINT CK_CouponUsages_DiscountAmount CHECK (DiscountAmount >= 0),
  -- 1 si el pedido se cancela antes de pagar: el uso se devuelve al cupón
  IsVoided       BIT               NOT NULL CONSTRAINT DF_CouponUsages_IsVoided DEFAULT 0,
  CreatedAt      DATETIME2(3)      NOT NULL CONSTRAINT DF_CouponUsages_CreatedAt DEFAULT SYSUTCDATETIME(),
  -- Un cupón por pedido
  CONSTRAINT UQ_CouponUsages_Order UNIQUE (IDOrder)
);
CREATE INDEX IX_CouponUsages_Coupon_User ON dbo.CouponUsages (IDCoupon, IDUser) WHERE IsVoided = 0;

ALTER TABLE dbo.InventoryMovements ADD CONSTRAINT FK_InventoryMovements_Orders
  FOREIGN KEY (IDOrder) REFERENCES dbo.Orders (IDOrder);
