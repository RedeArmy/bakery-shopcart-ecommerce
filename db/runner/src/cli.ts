// Punto de entrada del runner: "migrate" aplica lo pendiente, "verify" comprueba que la base coincide con los archivos y "seed"
// crea las cuentas de demostración.
// Códigos de salida: 0 correcto, 1 problemas detectados (deriva, pendientes), 2 error de la herramienta.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type sql from 'mssql';
import { isTestDatabase, loadRunnerConfig, type SeedConfig } from './config.js';
import {
  acquireLock,
  applyScript,
  connect,
  ensureControlTables,
  enforceCollation,
  ensureDatabase,
  loadState,
  provisionAppLogin,
  readLiveDefinitions,
} from './database.js';
import { MigrationError } from './errors.js';
import { findProblems, planRun } from './plan.js';
import { discoverScripts } from './scripts.js';
import { seedDemoAccounts } from './seed-demo.js';
import { inSequence } from './sequence.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function migrate(): Promise<number> {
  const config = loadRunnerConfig(process.env);
  const scripts = discoverScripts(process.env['DB_SCRIPTS_ROOT'] ?? join(ROOT, 'db'));

  const master = await connect(config, 'master');
  try {
    await ensureDatabase(master, config.database);
  } finally {
    await master.close();
  }

  const pool = await connect(config, config.database);
  try {
    await enforceCollation(pool, config.database);
    await acquireLock(pool);
    await ensureControlTables(pool);

    const pending = planRun(scripts, await loadState(pool));
    await inSequence(pending, async (script) => {
      await applyScript(pool, script);
      console.log(`Applied ${script.fileName}`);
    });
    // El login se alinea después de migrar: el GRANT sobre el esquema cubre también lo recién creado
    if (config.appLogin !== undefined) {
      const master = await connect(config, 'master');
      try {
        await provisionAppLogin(master, pool, config.appLogin);
      } finally {
        await master.close();
      }
      console.log(`Application login ${config.appLogin.user} is up to date.`);
    }
    if (config.seed !== undefined) {
      if (isTestDatabase(config.database)) {
        console.log(
          `Demo accounts skipped: ${config.database} is a test database and tSQLt owns its data.`,
        );
      } else {
        await seedAccounts(pool, config.seed);
      }
    }
    console.log(
      pending.length === 0
        ? `${config.database} is up to date.`
        : `${config.database}: ${pending.length} script(s) applied.`,
    );
    return 0;
  } finally {
    await pool.close();
  }
}

async function seedAccounts(pool: sql.ConnectionPool, passwords: SeedConfig): Promise<void> {
  const seeded = await seedDemoAccounts(pool, passwords);
  const created = seeded.filter((account) => account.created).map((account) => account.email);
  console.log(
    created.length === 0
      ? 'Demo accounts are up to date.'
      : `Demo accounts created: ${created.join(', ')}.`,
  );
}

/** Crea las cuentas de demostración sin migrar (npm run seed); exige SEED_DEMO_DATA=true para no sembrar por accidente. */
async function seed(): Promise<number> {
  const config = loadRunnerConfig(process.env);
  if (config.seed === undefined) {
    console.error('Set SEED_DEMO_DATA=true to create the demo accounts.');
    return 1;
  }
  if (isTestDatabase(config.database)) {
    console.error(
      `${config.database} is a test database: tSQLt owns its data, so no demo account is created.`,
    );
    return 1;
  }
  const pool = await connect(config, config.database);
  try {
    await enforceCollation(pool, config.database);
    await acquireLock(pool);
    await seedAccounts(pool, config.seed);
    return 0;
  } finally {
    await pool.close();
  }
}

async function verify(): Promise<number> {
  const config = loadRunnerConfig(process.env);
  const scripts = discoverScripts(process.env['DB_SCRIPTS_ROOT'] ?? join(ROOT, 'db'));

  const pool = await connect(config, config.database);
  try {
    await enforceCollation(pool, config.database);
    await ensureControlTables(pool);
    const state = await loadState(pool);
    const live = await readLiveDefinitions(
      pool,
      state.objects.map((item) => item.objectName),
    );
    const problems = findProblems(scripts, state, live);
    if (problems.length === 0) {
      console.log(`${config.database} matches the scripts in the repository.`);
      return 0;
    }
    for (const problem of problems) console.error(problem);
    return 1;
  } finally {
    await pool.close();
  }
}

async function main(): Promise<number> {
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const command = process.argv[2];
  if (command === 'migrate') return migrate();
  if (command === 'verify') return verify();
  if (command === 'seed') return seed();
  console.error('Usage: cli.ts <migrate|verify|seed>');
  return 2;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  // Un cambio rechazado por el runner (deriva, versión sin subir) es un problema de los scripts, no de la herramienta
  process.exitCode = error instanceof MigrationError ? 1 : 2;
}
