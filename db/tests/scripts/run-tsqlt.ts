// Instala tSQLt en la base de pruebas (solo CI), ejecuta todas las pruebas y exporta el resultado en JUnit XML.
// Códigos de salida: 0 todas las pruebas pasan, 1 hay fallos (o no hay pruebas), 2 error de la herramienta.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

import { verifyDirectory } from '../../../tools/scripts/lib/checksums.js';
import { splitBatches } from './lib/batches.js';
import { loadConfig, type TestConfig } from './lib/config.js';
import { buildJUnitXml, summarise, type TestResultRow } from './lib/junit.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const INSTALL_DIRECTORY = join(ROOT, 'db/tests/tsqlt/install');
const TEST_DIRECTORY = join(ROOT, 'db/tests/tsqlt');

// tSQLt lanza este número de error cuando alguna prueba falla; no es un fallo de la herramienta
const TSQLT_FAILURE_ERROR = 50000;
const CONNECT_ATTEMPTS = 30;
const CONNECT_DELAY_MS = 2000;

const pause = (ms: number): Promise<void> =>
  new Promise((done) => {
    setTimeout(done, ms);
  });

function poolFor(config: TestConfig, database: string): sql.ConnectionPool {
  return new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database,
    // El servidor de pruebas es desechable y usa un certificado autofirmado
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 120_000,
    pool: { min: 1, max: 1 },
  });
}

// Ejecuta las tareas una tras otra y en orden: el orden de los lotes y de los archivos importa
async function inSequence<T>(
  items: readonly T[],
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  await items.reduce<Promise<unknown>>(
    (previous, item) => previous.then(() => task(item)),
    Promise.resolve(),
  );
}

// SQL Server tarda en aceptar conexiones tras arrancar el contenedor: se reintenta en lugar de fallar
async function connect(
  config: TestConfig,
  database: string,
  attempt = 1,
): Promise<sql.ConnectionPool> {
  const pool = poolFor(config, database);
  try {
    return await pool.connect();
  } catch (error) {
    await pool.close().catch(() => undefined);
    if (attempt >= CONNECT_ATTEMPTS) throw error;
    console.log(`Waiting for SQL Server (attempt ${attempt}/${CONNECT_ATTEMPTS})...`);
    await pause(CONNECT_DELAY_MS);
    return connect(config, database, attempt + 1);
  }
}

async function runScript(pool: sql.ConnectionPool, path: string): Promise<void> {
  const batches = splitBatches(readFileSync(path, 'utf8'));
  await inSequence(batches, (batch) => pool.request().batch(batch));
  console.log(`Ran ${path.slice(ROOT.length + 1)} (${batches.length} batches).`);
}

async function ensureDatabase(pool: sql.ConnectionPool, name: string): Promise<void> {
  // El nombre ya está validado, pero se pasa como parámetro y se entrecomilla con QUOTENAME de todos modos
  await pool.request().input('name', sql.NVarChar(128), name).query(`
    DECLARE @create NVARCHAR(400) = N'CREATE DATABASE ' + QUOTENAME(@name) + N';';
    IF DB_ID(@name) IS NULL EXEC sp_executesql @create;
  `);
}

// La base de pruebas puede contener el esquema migrado: se conserva y solo se retira tSQLt, porque
// tSQLt.class.sql no se puede reinstalar sobre una instalación previa (el ensamblado CLR está en uso)
// y tSQLt nunca debe quedarse en la base de datos (ADR-0023).
async function uninstallIfPresent(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().batch("IF SCHEMA_ID(N'tSQLt') IS NOT NULL EXEC tSQLt.Uninstall;");
}

async function runAllTests(pool: sql.ConnectionPool): Promise<void> {
  try {
    await pool.request().batch('EXEC tSQLt.RunAll;');
  } catch (error) {
    // RunAll termina con un error cuando hay pruebas fallidas: el detalle se lee de tSQLt.TestResult
    const isTestFailure = error instanceof sql.RequestError && error.number === TSQLT_FAILURE_ERROR;
    if (!isTestFailure) throw error;
  }
}

async function readResults(pool: sql.ConnectionPool): Promise<TestResultRow[]> {
  const result = await pool.request().query<TestResultRow>(`
    SELECT Class, TestCase, Result, Msg, TestStartTime, TestEndTime
    FROM tSQLt.TestResult
    ORDER BY Class, TestCase;
  `);
  return result.recordset;
}

function testFiles(): string[] {
  return readdirSync(TEST_DIRECTORY)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => join(TEST_DIRECTORY, file));
}

async function main(): Promise<number> {
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const config = loadConfig(process.env);

  // Un archivo de terceros alterado no debe llegar a ejecutarse en el servidor
  const problems = verifyDirectory(INSTALL_DIRECTORY);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    return 2;
  }

  console.log(`Installing tSQLt in ${config.database} on ${config.host}:${config.port}.`);

  const master = await connect(config, 'master');
  try {
    await ensureDatabase(master, config.database);
    await runScript(master, join(INSTALL_DIRECTORY, 'PrepareServer.sql'));
  } finally {
    await master.close();
  }

  const pool = await connect(config, config.database);
  try {
    await uninstallIfPresent(pool);
    await runScript(pool, join(INSTALL_DIRECTORY, 'tSQLt.class.sql'));
    await inSequence(testFiles(), (file) => runScript(pool, file));

    await runAllTests(pool);
    const rows = await readResults(pool);

    mkdirSync(dirname(resolve(config.reportPath)), { recursive: true });
    writeFileSync(resolve(config.reportPath), buildJUnitXml(rows), 'utf8');

    const summary = summarise(rows);
    for (const row of rows.filter((item) => item.Result !== 'Success')) {
      console.error(`${row.Result}: [${row.Class}].[${row.TestCase}] ${row.Msg ?? ''}`);
    }
    console.log(
      `tSQLt: ${summary.total} tests, ${summary.failures} failures, ${summary.errors} errors, ${summary.skipped} skipped. Report: ${config.reportPath}`,
    );

    // Cero pruebas casi siempre indica un problema de instalación, no un éxito
    return summary.total === 0 || summary.failures + summary.errors > 0 ? 1 : 0;
  } finally {
    // Un fallo al retirar tSQLt no debe ocultar el resultado de las pruebas
    await uninstallIfPresent(pool).catch((error: unknown) => {
      console.error('Could not uninstall tSQLt:', error instanceof Error ? error.message : error);
    });
    await pool.close();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
