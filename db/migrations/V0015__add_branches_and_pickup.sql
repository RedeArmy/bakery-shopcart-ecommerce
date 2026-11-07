/* =====================================================================
   Migración : V0015__add_branches_and_pickup
   Cambio    : Sucursales y recogida en sucursal. Un pedido se entrega en una dirección del cliente (como hasta ahora) o se
               recoge en una sucursal. Las sucursales las administra un administrador y nunca se borran: se desactivan, porque
               los pedidos ya hechos las citan.
   Forward   : Solo agrega una tabla y columnas, y relaja a NULL los datos de la dirección de entrega (un pedido de recogida no
               tiene dirección); ningún dato existente cambia: todos los pedidos anteriores quedan como entrega a domicilio.
   ===================================================================== */

CREATE TABLE dbo.Branches (
  IDBranch     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Branches PRIMARY KEY,
  Name         NVARCHAR(80)      NOT NULL,
  Line1        NVARCHAR(200)     NOT NULL,
  Municipality NVARCHAR(80)      NOT NULL,
  Department   NVARCHAR(80)      NOT NULL,
  Phone        NVARCHAR(20)      NULL,
  -- Texto libre para el cliente ("Lunes a sábado de 8:00 a 18:00"); no se interpreta
  OpeningHours NVARCHAR(200)     NULL,
  IsActive     BIT               NOT NULL CONSTRAINT DF_Branches_IsActive DEFAULT 1,
  CreatedAt    DATETIME2(3)      NOT NULL CONSTRAINT DF_Branches_CreatedAt DEFAULT SYSUTCDATETIME(),
  UpdatedAt    DATETIME2(3)      NULL,
  CONSTRAINT CK_Branches_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0)
);
GO

-- El nombre es único entre las sucursales activas: una desactivada libera su nombre para una nueva
CREATE UNIQUE INDEX UX_Branches_Name_Active ON dbo.Branches (Name) WHERE IsActive = 1;
GO

-- Un pedido de recogida no tiene dirección de entrega
ALTER TABLE dbo.Orders ALTER COLUMN DeliveryRecipient    NVARCHAR(120) NULL;
ALTER TABLE dbo.Orders ALTER COLUMN DeliveryPhone        NVARCHAR(20)  NULL;
ALTER TABLE dbo.Orders ALTER COLUMN DeliveryLine1        NVARCHAR(200) NULL;
ALTER TABLE dbo.Orders ALTER COLUMN DeliveryMunicipality NVARCHAR(80)  NULL;
ALTER TABLE dbo.Orders ALTER COLUMN DeliveryDepartment   NVARCHAR(80)  NULL;
GO

ALTER TABLE dbo.Orders ADD
  FulfilmentType      NVARCHAR(10)  NOT NULL CONSTRAINT DF_Orders_FulfilmentType DEFAULT N'Delivery',
  IDBranch            INT           NULL CONSTRAINT FK_Orders_Branches REFERENCES dbo.Branches (IDBranch),
  -- Copias de la sucursal, por la misma razón que la dirección: editarla o desactivarla no altera lo ya pedido
  PickupBranchName    NVARCHAR(80)  NULL,
  PickupBranchAddress NVARCHAR(300) NULL;
GO

-- O es entrega con su dirección completa y sin sucursal, o es recogida con su sucursal y sin dirección: nunca una mezcla
ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_Fulfilment CHECK (
  (FulfilmentType = N'Delivery'
     AND IDBranch IS NULL AND PickupBranchName IS NULL AND PickupBranchAddress IS NULL
     AND DeliveryRecipient IS NOT NULL AND DeliveryPhone IS NOT NULL AND DeliveryLine1 IS NOT NULL
     AND DeliveryMunicipality IS NOT NULL AND DeliveryDepartment IS NOT NULL)
  OR
  (FulfilmentType = N'Pickup'
     AND IDBranch IS NOT NULL AND PickupBranchName IS NOT NULL AND PickupBranchAddress IS NOT NULL
     AND DeliveryRecipient IS NULL AND DeliveryPhone IS NULL AND DeliveryLine1 IS NULL
     AND DeliveryMunicipality IS NULL AND DeliveryDepartment IS NULL));
GO

-- Índice de la llave foránea y de la pregunta "¿esta sucursal tiene pedidos abiertos?" al desactivarla
CREATE INDEX IX_Orders_Branch ON dbo.Orders (IDBranch, IDOrderStatus) WHERE IDBranch IS NOT NULL;
GO
