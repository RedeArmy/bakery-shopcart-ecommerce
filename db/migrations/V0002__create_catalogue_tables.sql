/* =====================================================================
   Migración : V0002 · Catálogo y direcciones
   Contenido : Categories, Products, ProductImages, Attributes, Variants, VariantAttributes, Addresses
   Nota      : Inmutable una vez aplicada; los cambios van en una migración nueva.
   ===================================================================== */
SET NOCOUNT ON;

CREATE TABLE dbo.Categories (
  IDCategory       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Categories PRIMARY KEY,
  IDParentCategory INT               NULL CONSTRAINT FK_Categories_Parent REFERENCES dbo.Categories (IDCategory),
  Name             NVARCHAR(80)      NOT NULL CONSTRAINT UQ_Categories_Name UNIQUE,
  Description      NVARCHAR(300)     NULL,
  IsActive         BIT               NOT NULL CONSTRAINT DF_Categories_IsActive DEFAULT 1
);

CREATE TABLE dbo.Products (
  IDProduct    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Products PRIMARY KEY,
  IDCategory   INT               NOT NULL CONSTRAINT FK_Products_Categories REFERENCES dbo.Categories (IDCategory),
  Name         NVARCHAR(150)     NOT NULL,
  Description  NVARCHAR(1000)    NULL,
  -- Días de anticipación que necesita la pastelería: limita la fecha de entrega y la ventana del depósito
  LeadTimeDays TINYINT           NOT NULL CONSTRAINT DF_Products_LeadTimeDays DEFAULT 0,
  IsActive     BIT               NOT NULL CONSTRAINT DF_Products_IsActive DEFAULT 1,
  -- Concurrencia optimista al editar desde el panel de administración
  RowVer       ROWVERSION
);
CREATE INDEX IX_Products_Category ON dbo.Products (IDCategory) WHERE IsActive = 1;

CREATE TABLE dbo.ProductImages (
  IDProductImage INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProductImages PRIMARY KEY,
  IDProduct      INT               NOT NULL CONSTRAINT FK_ProductImages_Products REFERENCES dbo.Products (IDProduct),
  Url            NVARCHAR(500)     NOT NULL,
  SortOrder      TINYINT           NOT NULL CONSTRAINT DF_ProductImages_SortOrder DEFAULT 0,
  IsPrimary      BIT               NOT NULL CONSTRAINT DF_ProductImages_IsPrimary DEFAULT 0
);
-- Cada producto tiene como máximo una imagen principal
CREATE UNIQUE INDEX UX_ProductImages_OnePrimary ON dbo.ProductImages (IDProduct) WHERE IsPrimary = 1;

CREATE TABLE dbo.Variants (
  IDVariant     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Variants PRIMARY KEY,
  IDProduct     INT               NOT NULL CONSTRAINT FK_Variants_Products REFERENCES dbo.Products (IDProduct),
  SKU           NVARCHAR(40)      NOT NULL CONSTRAINT UQ_Variants_SKU UNIQUE,
  -- El precio incluye IVA (ADR-0008)
  Price         DECIMAL(18,2)     NOT NULL CONSTRAINT CK_Variants_Price CHECK (Price > 0),
  OnHandStock   INT               NOT NULL CONSTRAINT DF_Variants_OnHandStock DEFAULT 0
                                  CONSTRAINT CK_Variants_OnHandStock CHECK (OnHandStock >= 0),
  ReservedStock INT               NOT NULL CONSTRAINT DF_Variants_ReservedStock DEFAULT 0
                                  CONSTRAINT CK_Variants_ReservedStock CHECK (ReservedStock >= 0),
  IsActive      BIT               NOT NULL CONSTRAINT DF_Variants_IsActive DEFAULT 1,
  RowVer        ROWVERSION,
  -- Red de seguridad anti-sobreventa: ni un procedimiento defectuoso puede reservar más de lo que hay (ADR-0007)
  CONSTRAINT CK_Variants_ReservedVsOnHand CHECK (ReservedStock <= OnHandStock)
);
CREATE INDEX IX_Variants_Product ON dbo.Variants (IDProduct);

CREATE TABLE dbo.Attributes (
  IDAttribute INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Attributes PRIMARY KEY,
  Name        NVARCHAR(40)      NOT NULL CONSTRAINT UQ_Attributes_Name UNIQUE
);

CREATE TABLE dbo.VariantAttributes (
  IDVariant   INT          NOT NULL CONSTRAINT FK_VariantAttributes_Variants REFERENCES dbo.Variants (IDVariant),
  IDAttribute INT          NOT NULL CONSTRAINT FK_VariantAttributes_Attributes REFERENCES dbo.Attributes (IDAttribute),
  Value       NVARCHAR(60) NOT NULL,
  CONSTRAINT PK_VariantAttributes PRIMARY KEY (IDVariant, IDAttribute)
);

CREATE TABLE dbo.Addresses (
  IDAddress    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Addresses PRIMARY KEY,
  IDUser       INT               NOT NULL CONSTRAINT FK_Addresses_Users REFERENCES dbo.Users (IDUser),
  Label        NVARCHAR(40)      NOT NULL,
  Recipient    NVARCHAR(120)     NOT NULL,
  Phone        NVARCHAR(20)      NOT NULL,
  Line1        NVARCHAR(200)     NOT NULL,
  Line2        NVARCHAR(200)     NULL,
  Municipality NVARCHAR(80)      NOT NULL,
  Department   NVARCHAR(80)      NOT NULL,
  Reference    NVARCHAR(200)     NULL,
  IsActive     BIT               NOT NULL CONSTRAINT DF_Addresses_IsActive DEFAULT 1
);
CREATE INDEX IX_Addresses_User ON dbo.Addresses (IDUser);
