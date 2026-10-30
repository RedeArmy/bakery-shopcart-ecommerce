// Tablas de control del runner. Las crea el propio runner (idempotente) porque debe registrar la
// migración V0001 antes de que exista ninguna tabla. DdlHistory y su trigger llegan con una migración.
// Checksum es el SHA-256 del contenido con fin de línea LF; DefinitionChecksum es el resumen de OBJECT_DEFINITION
// justo después de aplicar el objeto, y db:verify lo usa para detectar cambios hechos a mano.
export const CONTROL_TABLES_SQL = `
IF OBJECT_ID(N'dbo.SchemaVersion', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SchemaVersion (
    IDSchemaVersion INT IDENTITY(1,1) CONSTRAINT PK_SchemaVersion PRIMARY KEY,
    Number          INT NOT NULL,
    Type            CHAR(1) NOT NULL CONSTRAINT CK_SchemaVersion_Type CHECK (Type IN ('V','R','S')),
    Description     NVARCHAR(200) NOT NULL,
    FileName        NVARCHAR(260) NOT NULL,
    Checksum        CHAR(64) NOT NULL,
    ExecutedBy      NVARCHAR(128) NOT NULL CONSTRAINT DF_SchemaVersion_ExecutedBy DEFAULT SUSER_SNAME(),
    ExecutedAt      DATETIME2(3) NOT NULL CONSTRAINT DF_SchemaVersion_ExecutedAt DEFAULT SYSUTCDATETIME(),
    DurationMs      INT NOT NULL,
    IsSuccessful    BIT NOT NULL
  );
  CREATE INDEX IX_SchemaVersion_TypeNumber ON dbo.SchemaVersion (Type, Number) INCLUDE (Checksum, IsSuccessful);
END;

IF OBJECT_ID(N'dbo.ObjectVersions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ObjectVersions (
    IDObjectVersion    INT IDENTITY(1,1) CONSTRAINT PK_ObjectVersions PRIMARY KEY,
    ObjectName         SYSNAME NOT NULL,
    ObjectType         CHAR(2) NOT NULL CONSTRAINT CK_ObjectVersions_ObjectType CHECK (ObjectType IN ('P','V','IF','TR')),
    Version            NVARCHAR(20) NOT NULL,
    Checksum           CHAR(64) NOT NULL,
    DefinitionChecksum CHAR(64) NOT NULL,
    IDSchemaVersion    INT NOT NULL CONSTRAINT FK_ObjectVersions_SchemaVersion REFERENCES dbo.SchemaVersion (IDSchemaVersion),
    Change             NVARCHAR(300) NOT NULL,
    IsCurrent          BIT NOT NULL,
    CONSTRAINT UQ_ObjectVersions UNIQUE (ObjectName, Version)
  );
END;
`;
