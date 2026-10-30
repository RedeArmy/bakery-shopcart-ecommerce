/* =====================================================================
   Migración : V0008 · Idempotencia, auditoría, configuración e historial de DDL
   Contenido : IdempotentRequests, AuditLog, Configuration, DdlHistory
   Nota      : SchemaVersion y ObjectVersions las crea el propio runner, porque debe
               registrar V0001 antes de que exista ninguna tabla (ver docs/database/versioning.md).
   ===================================================================== */
SET NOCOUNT ON;

-- Primera línea de defensa de la idempotencia (ADR-0004); la segunda son los índices únicos de cada tabla
CREATE TABLE dbo.IdempotentRequests (
  IDIdempotentRequest  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_IdempotentRequests PRIMARY KEY,
  -- 'U:<IDUser>' para un cliente con sesión o 'G:<GuestToken>' para un visitante
  Scope                NVARCHAR(64)         NOT NULL,
  Method               NVARCHAR(7)          NOT NULL,
  Route                NVARCHAR(200)        NOT NULL,
  IdempotencyKey       NVARCHAR(64)         NOT NULL,
  -- La misma llave con otro cuerpo se rechaza: el hash permite detectarlo
  RequestHash          CHAR(64)             NOT NULL,
  Status               NVARCHAR(12)         NOT NULL CONSTRAINT CK_IdempotentRequests_Status CHECK (Status IN ('InProgress', 'Completed', 'Failed')),
  HttpStatus           SMALLINT             NULL,
  ResponseBody         NVARCHAR(MAX)        NULL,
  CreatedAt            DATETIME2(3)         NOT NULL CONSTRAINT DF_IdempotentRequests_CreatedAt DEFAULT SYSUTCDATETIME(),
  ProcessingStartedAt  DATETIME2(3)         NOT NULL CONSTRAINT DF_IdempotentRequests_ProcessingStartedAt DEFAULT SYSUTCDATETIME(),
  ExpiresAt            DATETIME2(3)         NOT NULL,
  CONSTRAINT UQ_IdempotentRequests_Key UNIQUE (Scope, Method, Route, IdempotencyKey)
);
CREATE INDEX IX_IdempotentRequests_Expiry ON dbo.IdempotentRequests (ExpiresAt);

CREATE TABLE dbo.AuditLog (
  IDAuditLog     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
  -- Products, Prices, Stock, Coupons, Orders o Payments; solo lo escribe SP_Audit_Record
  Module         NVARCHAR(30)         NOT NULL,
  EntityName     NVARCHAR(50)         NOT NULL,
  EntityKey      NVARCHAR(40)         NOT NULL,
  Action         NVARCHAR(20)         NOT NULL CONSTRAINT CK_AuditLog_Action CHECK (Action IN ('Create', 'Update', 'Deactivate', 'StatusChange')),
  PreviousValue  NVARCHAR(MAX)        NULL CONSTRAINT CK_AuditLog_PreviousValue CHECK (PreviousValue IS NULL OR ISJSON(PreviousValue) = 1),
  NewValue       NVARCHAR(MAX)        NULL CONSTRAINT CK_AuditLog_NewValue CHECK (NewValue IS NULL OR ISJSON(NewValue) = 1),
  IDUser         INT                  NULL,
  CreatedAt      DATETIME2(3)         NOT NULL CONSTRAINT DF_AuditLog_CreatedAt DEFAULT SYSUTCDATETIME(),
  IDCorrelation  UNIQUEIDENTIFIER     NULL
);
CREATE INDEX IX_AuditLog_Module_CreatedAt ON dbo.AuditLog (Module, CreatedAt DESC);

-- Parámetros de negocio que cambian sin desplegar (reserva, envío, IVA...); los valores los carga una semilla
CREATE TABLE dbo.Configuration (
  SettingKey   NVARCHAR(50)  NOT NULL CONSTRAINT PK_Configuration PRIMARY KEY,
  SettingValue NVARCHAR(100) NOT NULL
);

-- Un trigger de base de datos (V0009) la llena con todo CREATE, ALTER y DROP de procedimientos, vistas y funciones,
-- incluidos los hechos a mano, para que db:verify tenga contexto cuando detecta un cambio ajeno al runner
CREATE TABLE dbo.DdlHistory (
  IDDdlHistory BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DdlHistory PRIMARY KEY,
  EventName    NVARCHAR(60)         NOT NULL,
  ObjectName   SYSNAME              NOT NULL,
  Definition   NVARCHAR(MAX)        NULL,
  UserName     SYSNAME              NOT NULL,
  CreatedAt    DATETIME2(3)         NOT NULL CONSTRAINT DF_DdlHistory_CreatedAt DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_DdlHistory_Object ON dbo.DdlHistory (ObjectName, CreatedAt DESC);
