/* =====================================================================
   Migración : V0004 · Carrito y cupones
   Contenido : Carts, CartItems, Coupons
   Nota      : Carts y Coupons se referencian entre sí; la clave foránea se añade al final.
   ===================================================================== */
SET NOCOUNT ON;

CREATE TABLE dbo.Carts (
  IDCart         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Carts PRIMARY KEY,
  IDUser         INT               NULL CONSTRAINT FK_Carts_Users REFERENCES dbo.Users (IDUser),
  -- Un visitante sin cuenta se identifica por este token hasta que inicia sesión y el carrito se fusiona
  GuestToken     UNIQUEIDENTIFIER  NULL,
  IDCoupon       INT               NULL,
  Status         NVARCHAR(12)      NOT NULL CONSTRAINT CK_Carts_Status CHECK (Status IN ('Active', 'Converted', 'Discarded')),
  CreatedAt      DATETIME2(3)      NOT NULL CONSTRAINT DF_Carts_CreatedAt DEFAULT SYSUTCDATETIME(),
  LastActivityAt DATETIME2(3)      NOT NULL CONSTRAINT DF_Carts_LastActivityAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_Carts_Owner CHECK (IDUser IS NOT NULL OR GuestToken IS NOT NULL)
);
-- Índice único filtrado y no UNIQUE: SQL Server trata los NULL como iguales en una restricción UNIQUE,
-- así que solo permitiría un carrito con sesión en toda la tabla
CREATE UNIQUE INDEX UX_Carts_GuestToken ON dbo.Carts (GuestToken) WHERE GuestToken IS NOT NULL;
-- Un cliente tiene como máximo un carrito activo
CREATE UNIQUE INDEX UX_Carts_OneActivePerUser ON dbo.Carts (IDUser) WHERE Status = 'Active' AND IDUser IS NOT NULL;

CREATE TABLE dbo.CartItems (
  IDCartItem  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CartItems PRIMARY KEY,
  IDCart      INT               NOT NULL CONSTRAINT FK_CartItems_Carts REFERENCES dbo.Carts (IDCart),
  IDVariant   INT               NOT NULL CONSTRAINT FK_CartItems_Variants REFERENCES dbo.Variants (IDVariant),
  -- Cantidades absolutas, no incrementos (ADR-0013)
  Quantity    INT               NOT NULL CONSTRAINT CK_CartItems_Quantity CHECK (Quantity BETWEEN 1 AND 99),
  Inscription NVARCHAR(60)      NULL,
  -- El precio no se guarda en el carrito: siempre se lee el vigente
  CONSTRAINT UQ_CartItems_Line UNIQUE (IDCart, IDVariant)
);

CREATE TABLE dbo.Coupons (
  IDCoupon              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Coupons PRIMARY KEY,
  Code                  NVARCHAR(30)      NOT NULL CONSTRAINT UQ_Coupons_Code UNIQUE,
  Type                  NVARCHAR(12)      NOT NULL CONSTRAINT CK_Coupons_Type CHECK (Type IN ('Percentage', 'FixedAmount')),
  Value                 DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Coupons_Value CHECK (Value > 0),
  MinimumAmount         DECIMAL(18,2)     NOT NULL CONSTRAINT DF_Coupons_MinimumAmount DEFAULT 0
                                          CONSTRAINT CK_Coupons_MinimumAmount CHECK (MinimumAmount >= 0),
  StartsAt              DATETIME2(3)      NOT NULL,
  EndsAt                DATETIME2(3)      NOT NULL,
  TotalUsageLimit       INT               NULL CONSTRAINT CK_Coupons_TotalUsageLimit CHECK (TotalUsageLimit > 0),
  PerCustomerUsageLimit INT               NULL CONSTRAINT CK_Coupons_PerCustomerUsageLimit CHECK (PerCustomerUsageLimit > 0),
  UsageCount            INT               NOT NULL CONSTRAINT DF_Coupons_UsageCount DEFAULT 0
                                          CONSTRAINT CK_Coupons_UsageCount CHECK (UsageCount >= 0),
  -- NULL significa que el cupón aplica a todo el carrito
  IDCategory            INT               NULL CONSTRAINT FK_Coupons_Categories REFERENCES dbo.Categories (IDCategory),
  IsActive              BIT               NOT NULL CONSTRAINT DF_Coupons_IsActive DEFAULT 1,
  CONSTRAINT CK_Coupons_Dates CHECK (EndsAt > StartsAt),
  CONSTRAINT CK_Coupons_Percentage CHECK (Type <> 'Percentage' OR Value <= 100),
  -- Segunda línea de defensa del límite total de usos, además del bloqueo en el procedimiento
  CONSTRAINT CK_Coupons_UsageVsLimit CHECK (TotalUsageLimit IS NULL OR UsageCount <= TotalUsageLimit)
);

ALTER TABLE dbo.Carts ADD CONSTRAINT FK_Carts_Coupons FOREIGN KEY (IDCoupon) REFERENCES dbo.Coupons (IDCoupon);
