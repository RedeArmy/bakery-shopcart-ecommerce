/* =====================================================================
   Migración : V0001 · Seguridad
   Contenido : Roles, Users, RefreshTokens
   Nota      : Inmutable una vez aplicada; los cambios van en una migración nueva.
   ===================================================================== */
SET NOCOUNT ON;

-- Los identificadores de rol son valores fijos con significado (1 Customer, 2 Operator, 3 Administrator),
-- por eso no son IDENTITY: el código y las semillas se refieren a ellos por número.
CREATE TABLE dbo.Roles (
  IDRole TINYINT      NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
  Name   NVARCHAR(30) NOT NULL CONSTRAINT UQ_Roles_Name UNIQUE
);

CREATE TABLE dbo.Users (
  IDUser         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
  IDRole         TINYINT           NOT NULL CONSTRAINT FK_Users_Roles REFERENCES dbo.Roles (IDRole),
  Email          NVARCHAR(256)     NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
  PasswordHash   NVARCHAR(255)     NOT NULL,
  FullName       NVARCHAR(120)     NOT NULL,
  Phone          NVARCHAR(20)      NULL,
  -- Un usuario se desactiva, nunca se borra: los pedidos y la auditoría lo referencian
  IsActive       BIT               NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
  -- Segunda capa del bloqueo de cuenta (la primera es el rate limit de nginx y Express)
  FailedAttempts TINYINT           NOT NULL CONSTRAINT DF_Users_FailedAttempts DEFAULT 0,
  LockedUntil    DATETIME2(3)      NULL,
  CreatedAt      DATETIME2(3)      NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.RefreshTokens (
  IDRefreshToken BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RefreshTokens PRIMARY KEY,
  IDUser         INT                  NOT NULL CONSTRAINT FK_RefreshTokens_Users REFERENCES dbo.Users (IDUser),
  -- Toda la cadena de una familia se revoca si se reutiliza un token ya rotado
  IDFamily       UNIQUEIDENTIFIER     NOT NULL,
  -- Solo se guarda el hash: un volcado de la base de datos no entrega tokens utilizables
  TokenHash      CHAR(64)             NOT NULL CONSTRAINT UQ_RefreshTokens_TokenHash UNIQUE,
  ExpiresAt      DATETIME2(3)         NOT NULL,
  RevokedAt      DATETIME2(3)         NULL,
  IDReplacedBy   BIGINT               NULL CONSTRAINT FK_RefreshTokens_ReplacedBy REFERENCES dbo.RefreshTokens (IDRefreshToken)
);

CREATE INDEX IX_RefreshTokens_User ON dbo.RefreshTokens (IDUser);
CREATE INDEX IX_RefreshTokens_Family ON dbo.RefreshTokens (IDFamily);
