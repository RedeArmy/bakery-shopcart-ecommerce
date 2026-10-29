# Database versioning

## Three kinds of script, all numbered

| Type | Location and name | Rule |
|---|---|---|
| Migration (structure and data) | `db/migrations/V0001__create_security_tables.sql` | **Immutable.** Once applied it is never edited; changes go into a new migration |
| Programmable object (procedure, view, function, trigger) | `db/objects/procedures/R0101__SP_Orders_CreateOrder.sql` | One file per object with `CREATE OR ALTER`. It is reapplied when it changes and **must raise the header version** |
| Seed | `db/seed/S0001__seed_catalogue.sql` | Idempotent with `MERGE`, reproducible |

The numeric prefix of `R` scripts fixes the dependency order between objects (for example `FU_Money_HalfEvenDivision` before the procedures that use it).

## Control tables

```sql
CREATE TABLE dbo.SchemaVersion (
  IDSchemaVersion INT IDENTITY(1,1) CONSTRAINT PK_SchemaVersion PRIMARY KEY,
  Number          INT NOT NULL,
  Type            CHAR(1) NOT NULL CHECK (Type IN ('V','R','S')),
  Description     NVARCHAR(200) NOT NULL,
  FileName        NVARCHAR(260) NOT NULL,
  Checksum        CHAR(64) NOT NULL,        -- SHA-256 del contenido con fin de línea normalizado a LF
  ExecutedBy      NVARCHAR(128) NOT NULL,
  ExecutedAt      DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  DurationMs      INT NOT NULL,
  IsSuccessful    BIT NOT NULL
);
CREATE TABLE dbo.ObjectVersions (
  IDObjectVersion INT IDENTITY(1,1) CONSTRAINT PK_ObjectVersions PRIMARY KEY,
  ObjectName      SYSNAME NOT NULL,
  ObjectType      CHAR(2) NOT NULL,          -- P, V, IF, TR
  Version         NVARCHAR(20) NOT NULL,     -- SemVer del objeto
  Checksum        CHAR(64) NOT NULL,
  IDSchemaVersion INT NOT NULL CONSTRAINT FK_ObjectVersions_SchemaVersion REFERENCES dbo.SchemaVersion(IDSchemaVersion),
  Change          NVARCHAR(300) NOT NULL,
  IsCurrent       BIT NOT NULL,
  CONSTRAINT UQ_ObjectVersions UNIQUE (ObjectName, Version)
);
CREATE TABLE dbo.DdlHistory (                -- poblada por un DDL trigger de la base de datos
  IDDdlHistory BIGINT IDENTITY(1,1) CONSTRAINT PK_DdlHistory PRIMARY KEY,
  EventName NVARCHAR(60), ObjectName SYSNAME, Definition NVARCHAR(MAX), UserName SYSNAME,
  CreatedAt DATETIME2(3) DEFAULT SYSUTCDATETIME()
);
```

## Mandatory header in every object

```sql
/* =====================================================================
   Objeto   : dbo.SP_Orders_CreateOrder
   Version  : 1.2.0
   Cambio   : Reparto de descuento por mayor resto; ventana de depósito
   Autor    : <autor>   Fecha: 2026-10-30   Ticket: SC-042
   Compat   : Parámetros nuevos con DEFAULT; llamadas 1.x siguen válidas
   ===================================================================== */
```

## What the runner does (`db/runner`, Node and TypeScript, own image)

1. Applies pending `V` migrations, `R` objects and `S` seeds in order, **each script in its own transaction**.
2. **Normalises line endings to LF before computing the checksum**, so the same script gives the same SHA-256 on Windows and Linux.
3. Verifies the checksum of already-applied migrations. If someone edited one, it **aborts** (drift detection).
4. For an `R` object: if the content changed but the header version did not, it **rejects**. If both changed, it applies the script, marks the previous version `IsCurrent = 0` and records the new one.
5. Writes the version as an `EXTENDED PROPERTY` of the object, visible from SSMS.
6. It is idempotent: it runs on every compose start.

## Additional controls

- A **DDL trigger** captures `CREATE`, `ALTER` and `DROP` of procedures, views and functions, even those made by hand, into `DdlHistory`.
- **`npm run db:verify`** compares `OBJECT_DEFINITION` of every object with its recorded checksum and detects changes made outside the runner. CI runs it before installing tSQLt.
- **CI**: if a procedure changed in the diff but its `Version` did not, the pipeline fails. Lint also checks naming and forbidden types.
- **App ↔ schema compatibility:** the backend declares `REQUIRED_SCHEMA_VERSION`, compares it at start-up with `SP_System_GetSchemaVersion`, and `/health/ready` fails if the database is behind.
- **`GET /api/v1/admin/system/version`** returns the app version, schema version and procedure versions.

## Breaking changes

No `_v2` suffixes, to respect `SP_Module_Process`.

- **Compatible:** a new parameter with a `DEFAULT` raises the minor version.
- **Incompatible (expand/contract):** create a new procedure with a different process name, migrate the backend, mark the old one obsolete in its header, and remove it with a later migration.
- **Rollback:** forward-only. Fix with a compensating migration; the previous object is recovered from the Git tag or `DdlHistory` ([ADR-0003](../adr/0003-own-forward-only-migration-runner-in-node.md)).

## Versioning of everything else

SemVer through Git tags, a changelog generated from Conventional Commits (`release-please`), Docker images with the same tag, `info.version` in the OpenAPI document and the `/api/v1` prefix.
