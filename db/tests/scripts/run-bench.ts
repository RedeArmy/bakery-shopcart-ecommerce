// Banco de rendimiento: carga volumen realista en una base aparte (ShopCart_Bench) y mide las lecturas lógicas y el tiempo de
// los listados y reportes principales. Falla si alguno supera su límite, así una regresión (por ejemplo volver a COUNT(*) OVER ())
// se detecta con un comando y no en producción. Requiere el servidor de pruebas (npm run sql:test:up).
// Códigos de salida: 0 todo dentro de los límites, 1 alguna medición los supera, 2 error de la herramienta.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type sql from 'mssql';
import { connect } from '../../runner/src/database.js';
import { inSequence } from '../../runner/src/sequence.js';
import {
  assess,
  loadBenchSettings,
  logicalReads,
  type BenchCase,
  type BenchResult,
} from './lib/bench.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SEED_FILE = join(ROOT, 'db/tests/performance/bench-seed.sql');

// Un cliente cualquiera con pedidos (el 8.º de la carga) y la variante del kardex largo. EXEC no admite expresiones como argumento,
// así que cada lote las declara antes.
const DECLARATIONS =
  "DECLARE @Customer INT = (SELECT MIN(IDUser) FROM dbo.Users WHERE Email LIKE N'bench%') + 7, @Variant INT = (SELECT MIN(IDVariant) FROM dbo.Variants); ";

// Los dos reportes por fecha convierten la zona horaria de cada pedido pagado (AT TIME ZONE, unos 9 microsegundos por fila), así que
// su tiempo crece con los pedidos: el segundo que pide el enunciado vale para el volumen de las semillas (unos 5 000 pedidos) y aquí hay
// diez veces más. Por eso tienen su propio límite de tiempo.
const REPORT_MILLISECONDS = 3000;

// Los límites son unas 3 a 4 veces lo medido el 30 de octubre de 2026 con 50 000 pedidos (docs/operations/performance.md): dejan
// margen para cambios menores del optimizador y siguen siendo de 50 a 1 000 veces menores que lo que se medía antes de optimizar.
const CASES: readonly BenchCase[] = [
  {
    name: 'Orders_List, customer',
    sql: `EXEC dbo.SP_Orders_List @IDActor = @Customer, @AsStaff = 0;`,
    maxReads: 1500,
  },
  {
    name: 'Orders_List, staff',
    sql: 'EXEC dbo.SP_Orders_List @IDActor = 1, @AsStaff = 1;',
    maxReads: 2500,
  },
  {
    name: 'Orders_List, staff searching by number',
    sql: "EXEC dbo.SP_Orders_List @IDActor = 1, @AsStaff = 1, @Search = N'BN-4999';",
    maxReads: 6000,
  },
  {
    name: 'Audit_Query, one entity',
    sql: "EXEC dbo.SP_Audit_Query @Module = N'Orders', @EntityKey = N'4321';",
    maxReads: 150,
  },
  { name: 'Audit_Query, no filters', sql: 'EXEC dbo.SP_Audit_Query;', maxReads: 1500 },
  {
    name: 'Inventory_GetLedger, 60,000 movements',
    sql: `EXEC dbo.SP_Inventory_GetLedger @IDVariant = @Variant;`,
    maxReads: 1500,
  },
  { name: 'Users_List', sql: 'EXEC dbo.SP_Users_List;', maxReads: 500 },
  {
    name: 'Payments_ListPendingDeposits, history',
    sql: 'EXEC dbo.SP_Payments_ListPendingDeposits @IDPaymentStatus = 3;',
    maxReads: 2500,
  },
  {
    name: 'Dashboard_AbandonedCarts',
    sql: 'EXEC dbo.SP_Dashboard_AbandonedCarts;',
    maxReads: 2000,
  },
  { name: 'Dashboard_Summary', sql: 'EXEC dbo.SP_Dashboard_Summary;', maxReads: 1000 },
  {
    name: 'Dashboard_SalesByPeriod, a year by day',
    sql: "EXEC dbo.SP_Dashboard_SalesByPeriod @From = '2026-01-01', @To = '2026-12-31', @Granularity = 'day';",
    maxReads: 1000,
    maxMilliseconds: REPORT_MILLISECONDS,
  },
  {
    name: 'Dashboard_TopProducts, a year',
    sql: "EXEC dbo.SP_Dashboard_TopProducts @From = '2026-01-01', @To = '2026-12-31';",
    maxReads: 4000,
    maxMilliseconds: REPORT_MILLISECONDS,
  },
];

/** Ejecuta el lote dos veces (la primera compila y calienta la caché) y mide la segunda, con las lecturas que imprime SET STATISTICS IO. */
async function measure(pool: sql.ConnectionPool, benchCase: BenchCase): Promise<BenchResult> {
  await pool.request().batch(DECLARATIONS + benchCase.sql);
  const messages: string[] = [];
  const request = pool.request();
  request.on('info', (info: { message: string }) => messages.push(info.message));
  const started = performance.now();
  await request.batch(
    `SET STATISTICS IO ON; ${DECLARATIONS}${benchCase.sql} SET STATISTICS IO OFF;`,
  );
  return {
    name: benchCase.name,
    reads: logicalReads(messages),
    milliseconds: performance.now() - started,
  };
}

async function main(): Promise<number> {
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const settings = loadBenchSettings(process.env);
  const { database, ...connection } = settings;

  console.log(`Migrating ${database} on ${connection.host}:${connection.port}.`);
  // Node con su ruta absoluta y sin shell: así ningún directorio del PATH decide qué programa se ejecuta. El runner es el
  // mismo archivo que usa npm run db:migrate, cargado con tsx como lo hace ese script.
  const migrated = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'db/runner/src/cli.ts', 'migrate'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        DB_NAME: database,
        MIGRATION_HOST: connection.host,
        MIGRATION_PORT: String(connection.port),
        MIGRATION_PASSWORD: connection.password,
        SEED_DEMO_DATA: 'false',
      },
    },
  );
  if (migrated.status !== 0) return 2;

  const pool = await connect(connection, database);
  try {
    const loaded = await pool
      .request()
      .query<{ Orders: number }>('SELECT Orders = COUNT(*) FROM dbo.Orders;');
    if ((loaded.recordset[0]?.Orders ?? 0) === 0) {
      console.log('Loading 50,000 orders, 20,000 carts, 200,000 tokens and 200,000 audit rows.');
      await pool.request().batch(readFileSync(SEED_FILE, 'utf8'));
    } else {
      console.log('The volume data is already loaded; to start again drop the database.');
    }

    const problems: string[] = [];
    await inSequence(CASES, async (benchCase) => {
      const result = await measure(pool, benchCase);
      const problem = assess(benchCase, result);
      const status = problem === undefined ? 'ok  ' : 'FAIL';
      console.log(
        `  ${status} ${result.name}: ${result.reads} reads (limit ${benchCase.maxReads}), ${Math.round(result.milliseconds)} ms`,
      );
      if (problem !== undefined) problems.push(problem);
    });

    if (problems.length > 0) {
      console.error(
        `\n${problems.length} measurement(s) over the limit:\n- ${problems.join('\n- ')}`,
      );
      return 1;
    }
    console.log('\nEvery list and report is inside its limits.');
    return 0;
  } finally {
    await pool.close();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
