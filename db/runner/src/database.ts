// Acceso a SQL Server del runner. Los scripts de migración son SQL por naturaleza; el resto de
// sentencias usa siempre parámetros tipados, nunca valores concatenados.
import sql from 'mssql';
import { splitBatches } from './batches.js';
import { checksumOf } from './checksum.js';
import type { AppLoginConfig, ConnectionSettings } from './config.js';
import { DATABASE_COLLATION, assessCollation } from './collation.js';
import { CONTROL_TABLES_SQL } from './control-tables.js';
import { MigrationError } from './errors.js';
import { inSequence } from './sequence.js';
import type { AppliedScript, CurrentObject, DatabaseState } from './plan.js';
import type { ScriptFile } from './scripts.js';

const CONNECT_ATTEMPTS = 30;
const CONNECT_DELAY_MS = 2000;
const LOCK_TIMEOUT_MS = 60_000;
const LEVEL1_TYPES: Readonly<Record<string, string>> = {
  P: 'PROCEDURE',
  V: 'VIEW',
  IF: 'FUNCTION',
};

const pause = (ms: number): Promise<void> =>
  new Promise((done) => {
    setTimeout(done, ms);
  });

function poolFor(config: ConnectionSettings, database: string): sql.ConnectionPool {
  return new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database,
    options: { trustServerCertificate: config.trustServerCertificate, encrypt: true },
    requestTimeout: 300_000,
    // Una sola conexión: el bloqueo de aplicación y las transacciones viven en la misma sesión
    pool: { min: 1, max: 1 },
  });
}

/**
 * Un servidor recién creado con MSSQL_COLLATION acepta conexiones mientras todavía reconstruye sus bases de datos de
 * sistema (msdb aparece en recuperación). Crear una base de datos en esa ventana hace que la reconstrucción falle y el
 * servidor se detenga, así que "acepta conexiones" no basta: se espera a que master, model, msdb y tempdb estén en línea.
 */
async function assertServerStarted(pool: sql.ConnectionPool): Promise<void> {
  const result = await pool
    .request()
    .query<{ NotOnline: number }>(
      'SELECT NotOnline = COUNT(*) FROM sys.databases WHERE database_id IN (1, 2, 3, 4) AND state <> 0;',
    );
  if ((result.recordset[0]?.NotOnline ?? 0) > 0) {
    throw new Error('The server is still starting its system databases.');
  }
}

/** SQL Server tarda en aceptar conexiones tras arrancar el contenedor: se reintenta en lugar de fallar. */
export async function connect(
  config: ConnectionSettings,
  database: string,
  attempt = 1,
): Promise<sql.ConnectionPool> {
  const pool = poolFor(config, database);
  try {
    const connected = await pool.connect();
    await assertServerStarted(connected);
    return connected;
  } catch (error) {
    await pool.close().catch(() => undefined);
    if (attempt >= CONNECT_ATTEMPTS) throw error;
    console.log(`Waiting for SQL Server (attempt ${attempt}/${CONNECT_ATTEMPTS})...`);
    await pause(CONNECT_DELAY_MS);
    return connect(config, database, attempt + 1);
  }
}

/**
 * Crea la base de datos con el collation del proyecto si no existe (ADR-0025). El collation es una constante del
 * código y no un parámetro: CREATE DATABASE no admite parámetros en COLLATE y el valor nunca viene de fuera.
 */
export async function ensureDatabase(master: sql.ConnectionPool, name: string): Promise<void> {
  await master.request().input('name', sql.NVarChar(128), name).query(`
    DECLARE @create NVARCHAR(500) = N'CREATE DATABASE ' + QUOTENAME(@name) + N' COLLATE ${DATABASE_COLLATION};';
    IF DB_ID(@name) IS NULL EXEC sp_executesql @create;
  `);
}

/**
 * Comprueba que la base de datos conectada usa el collation del proyecto. Si no, aborta: un collation distinto
 * cambia qué filas cuentan como duplicadas y cómo se ordena el texto, y no se corrige a posteriori.
 */
export async function enforceCollation(
  pool: sql.ConnectionPool,
  databaseName: string,
): Promise<void> {
  const result = await pool.request().query<{
    DatabaseCollation: string;
    ServerCollation: string;
  }>(`
    SELECT
      CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS NVARCHAR(128)) AS DatabaseCollation,
      CAST(SERVERPROPERTY('Collation') AS NVARCHAR(128)) AS ServerCollation;
  `);
  const row = result.recordset[0];
  const findings = assessCollation(
    { database: row?.DatabaseCollation ?? 'unknown', server: row?.ServerCollation ?? 'unknown' },
    databaseName,
  );
  if (findings.warning !== undefined) console.warn(`warning: ${findings.warning}`);
  if (findings.error !== undefined) throw new MigrationError('COLLATION_MISMATCH', findings.error);
}

/** Impide que dos runners migren a la vez (por ejemplo, dos arranques de compose). */
export async function acquireLock(pool: sql.ConnectionPool): Promise<void> {
  const result = await pool
    .request()
    .output('result', sql.Int)
    .input('timeout', sql.Int, LOCK_TIMEOUT_MS).query(`
      EXEC @result = sys.sp_getapplock
        @Resource = N'ShopCart.Migrations', @LockMode = N'Exclusive',
        @LockOwner = N'Session', @LockTimeout = @timeout;
    `);
  const code = result.output['result'] as number;
  if (code < 0) {
    throw new MigrationError('LOCK_NOT_ACQUIRED', 'Another migration run holds the lock');
  }
}

export async function ensureControlTables(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().batch(CONTROL_TABLES_SQL);
}

interface AppliedRow {
  Number: number;
  Type: 'V' | 'R' | 'S';
  FileName: string;
  Checksum: string;
}

interface ObjectRow {
  ObjectName: string;
  Version: string;
  Checksum: string;
  DefinitionChecksum: string;
}

export async function loadState(pool: sql.ConnectionPool): Promise<DatabaseState> {
  // Solo cuenta la última ejecución correcta de cada script; los intentos fallidos quedan como historial
  const applied = await pool.request().query<AppliedRow>(`
    SELECT sv.Number, sv.Type, sv.FileName, sv.Checksum
    FROM dbo.SchemaVersion AS sv
    WHERE sv.IsSuccessful = 1
      AND sv.IDSchemaVersion = (
        SELECT MAX(x.IDSchemaVersion) FROM dbo.SchemaVersion AS x
        WHERE x.Type = sv.Type AND x.Number = sv.Number AND x.IsSuccessful = 1);
  `);
  const objects = await pool.request().query<ObjectRow>(`
    SELECT ObjectName, Version, Checksum, DefinitionChecksum
    FROM dbo.ObjectVersions WHERE IsCurrent = 1;
  `);

  const scripts: AppliedScript[] = applied.recordset.map((row) => ({
    type: row.Type,
    number: row.Number,
    fileName: row.FileName,
    checksum: row.Checksum,
  }));
  const current: CurrentObject[] = objects.recordset.map((row) => ({
    objectName: row.ObjectName,
    version: row.Version,
    checksum: row.Checksum,
    definitionChecksum: row.DefinitionChecksum,
  }));
  return { scripts, objects: current };
}

async function readDefinition(executor: sql.Request, objectName: string): Promise<string | null> {
  const result = await executor
    .input('name', sql.NVarChar(300), objectName)
    .query<{ Definition: string | null }>(
      'SELECT OBJECT_DEFINITION(OBJECT_ID(@name)) AS Definition;',
    );
  return result.recordset[0]?.Definition ?? null;
}

/** Resumen de la definición actual de cada objeto, o null si ya no existe. */
export async function readLiveDefinitions(
  pool: sql.ConnectionPool,
  names: readonly string[],
): Promise<Map<string, string | null>> {
  const live = new Map<string, string | null>();
  await inSequence(names, async (name) => {
    const definition = await readDefinition(pool.request(), name);
    live.set(name, definition === null ? null : checksumOf(definition));
  });
  return live;
}

async function recordVersion(
  transaction: sql.Transaction,
  script: ScriptFile,
  durationMs: number,
  successful: boolean,
): Promise<number> {
  const result = await new sql.Request(transaction)
    .input('number', sql.Int, script.number)
    .input('type', sql.Char(1), script.type)
    .input('description', sql.NVarChar(200), script.description)
    .input('fileName', sql.NVarChar(260), script.fileName)
    .input('checksum', sql.Char(64), script.checksum)
    .input('duration', sql.Int, durationMs)
    .input('successful', sql.Bit, successful).query<{ IDSchemaVersion: number }>(`
      INSERT INTO dbo.SchemaVersion (Number, Type, Description, FileName, Checksum, DurationMs, IsSuccessful)
      OUTPUT inserted.IDSchemaVersion
      VALUES (@number, @type, @description, @fileName, @checksum, @duration, @successful);
    `);
  return result.recordset[0]?.IDSchemaVersion ?? 0;
}

async function recordObject(
  transaction: sql.Transaction,
  script: ScriptFile,
  idSchemaVersion: number,
): Promise<void> {
  const info = script.object;
  if (info === undefined) return;

  const definition = await readDefinition(new sql.Request(transaction), info.name);
  if (definition === null) {
    throw new MigrationError(
      'OBJECT_NOT_CREATED',
      `${script.fileName} did not create ${info.name}`,
    );
  }

  await new sql.Request(transaction)
    .input('name', sql.NVarChar(128), info.name)
    .input('type', sql.Char(2), info.type)
    .input('version', sql.NVarChar(20), info.version)
    .input('checksum', sql.Char(64), script.checksum)
    .input('definition', sql.Char(64), checksumOf(definition))
    .input('idSchemaVersion', sql.Int, idSchemaVersion)
    .input('change', sql.NVarChar(300), info.change).query(`
      UPDATE dbo.ObjectVersions SET IsCurrent = 0 WHERE ObjectName = @name AND IsCurrent = 1;
      INSERT INTO dbo.ObjectVersions
        (ObjectName, ObjectType, Version, Checksum, DefinitionChecksum, IDSchemaVersion, Change, IsCurrent)
      VALUES (@name, @type, @version, @checksum, @definition, @idSchemaVersion, @change, 1);
    `);

  const level1Type = LEVEL1_TYPES[info.type];
  // Los triggers cuelgan de una tabla y su propiedad extendida tiene otro nivel: no se escribe en ellos
  if (level1Type === undefined) return;

  const [schema = 'dbo', objectName = info.name] = info.name.split('.');
  await new sql.Request(transaction)
    .input('schema', sql.NVarChar(128), schema)
    .input('object', sql.NVarChar(128), objectName)
    .input('level1Type', sql.NVarChar(128), level1Type)
    .input('version', sql.NVarChar(20), info.version).query(`
      IF EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(N'Version', N'SCHEMA', @schema, @level1Type, @object, NULL, NULL))
        EXEC sys.sp_updateextendedproperty @name = N'Version', @value = @version,
          @level0type = N'SCHEMA', @level0name = @schema, @level1type = @level1Type, @level1name = @object;
      ELSE
        EXEC sys.sp_addextendedproperty @name = N'Version', @value = @version,
          @level0type = N'SCHEMA', @level0name = @schema, @level1type = @level1Type, @level1name = @object;
    `);
}

async function recordFailure(pool: sql.ConnectionPool, script: ScriptFile, durationMs: number) {
  await pool
    .request()
    .input('number', sql.Int, script.number)
    .input('type', sql.Char(1), script.type)
    .input('description', sql.NVarChar(200), script.description)
    .input('fileName', sql.NVarChar(260), script.fileName)
    .input('checksum', sql.Char(64), script.checksum)
    .input('duration', sql.Int, durationMs).query(`
      INSERT INTO dbo.SchemaVersion (Number, Type, Description, FileName, Checksum, DurationMs, IsSuccessful)
      VALUES (@number, @type, @description, @fileName, @checksum, @duration, 0);
    `);
}

/** Ejecuta un script en su propia transacción y registra el resultado; si falla, deshace todo y lo anota. */
export async function applyScript(pool: sql.ConnectionPool, script: ScriptFile): Promise<void> {
  const started = Date.now();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await inSequence(splitBatches(script.content), (batch) =>
      new sql.Request(transaction).batch(batch),
    );
    const id = await recordVersion(transaction, script, Date.now() - started, true);
    await recordObject(transaction, script, id);
    await transaction.commit();
  } catch (error) {
    // Con XACT_ABORT la transacción puede estar ya cerrada: el rollback fallido no debe ocultar la causa
    await transaction.rollback().catch(() => undefined);
    await recordFailure(pool, script, Date.now() - started).catch(() => undefined);
    throw error;
  }
}

/**
 * Crea o actualiza el login de la aplicación y le concede solo EXECUTE (ADR-0002).
 * Se ejecuta en cada arranque: la contraseña de .env es la fuente de verdad, así que si se regenera
 * el archivo y se conserva el volumen, la base de datos se vuelve a alinear en lugar de rechazar a la aplicación.
 * El nombre y la contraseña se incrustan con QUOTENAME porque CREATE LOGIN no admite parámetros.
 */
export async function provisionAppLogin(
  master: sql.ConnectionPool,
  database: sql.ConnectionPool,
  login: AppLoginConfig,
): Promise<void> {
  await master
    .request()
    .input('user', sql.NVarChar(128), login.user)
    .input('password', sql.NVarChar(128), login.password).query(`
      DECLARE @quotedUser NVARCHAR(130) = QUOTENAME(@user);
      DECLARE @quotedPassword NVARCHAR(130) = QUOTENAME(@password, '''');
      DECLARE @statement NVARCHAR(MAX) = CASE
        WHEN EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @user)
          THEN N'ALTER LOGIN ' + @quotedUser + N' WITH PASSWORD = N' + @quotedPassword + N';'
        ELSE N'CREATE LOGIN ' + @quotedUser + N' WITH PASSWORD = N' + @quotedPassword + N', CHECK_POLICY = OFF;'
      END;
      EXEC sp_executesql @statement;
    `);

  await database.request().input('user', sql.NVarChar(128), login.user).query(`
    DECLARE @quotedUser NVARCHAR(130) = QUOTENAME(@user);
    DECLARE @statement NVARCHAR(MAX) = N'';
    IF DATABASE_PRINCIPAL_ID(@user) IS NULL
      SET @statement += N'CREATE USER ' + @quotedUser + N' FOR LOGIN ' + @quotedUser + N';';
    SET @statement += N'GRANT EXECUTE ON SCHEMA::dbo TO ' + @quotedUser + N';';
    SET @statement += N'DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO ' + @quotedUser + N';';
    EXEC sp_executesql @statement;
  `);
}
