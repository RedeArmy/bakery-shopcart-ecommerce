/** Login de la aplicación: solo ejecuta procedimientos y no puede tocar tablas (ADR-0002). */
export interface AppLoginConfig {
  user: string;
  password: string;
}

/** Lo mínimo para abrir una conexión; lo comparten el runner y el ejecutor de tSQLt. */
export interface ConnectionSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  /** El certificado de desarrollo es autofirmado; con un servidor real debe ser false */
  trustServerCertificate: boolean;
}

/** Contraseñas de las cuentas de demostración; nunca se versionan, salen del .env local (docs/operations/test-accounts.md). */
export interface SeedConfig {
  adminPassword: string;
  operatorPassword: string;
  customerPassword: string;
}

export interface RunnerConfig extends ConnectionSettings {
  database: string;
  /** Presente solo si DB_APP_PASSWORD está definida; en el CI no existe y no se crea ningún login */
  appLogin?: AppLoginConfig;
  /** Presente solo si SEED_DEMO_DATA es true: entonces se crean las cuentas de demostración */
  seed?: SeedConfig;
}

// QUOTENAME admite como máximo 128 caracteres: la contraseña se incrusta con ella en CREATE LOGIN
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_MIN_LENGTH = 8;
const DATABASE_NAME = /^[A-Za-z]\w{0,63}$/;

/** Lee la conexión del runner desde el entorno. Las migraciones necesitan DDL, así que usa el login sa. */
export function loadRunnerConfig(env: NodeJS.ProcessEnv): RunnerConfig {
  const password = env['MIGRATION_PASSWORD'] ?? env['MSSQL_SA_PASSWORD'];
  if (password === undefined || password === '') {
    throw new Error(
      'Set MSSQL_SA_PASSWORD (or MIGRATION_PASSWORD): the migrations need DDL permissions.',
    );
  }

  const database = env['DB_NAME'] ?? 'ShopCart';
  if (!DATABASE_NAME.test(database)) {
    throw new Error(`DB_NAME "${database}" is not a valid database name.`);
  }

  // MIGRATION_PORT permite migrar desde el equipo anfitrión, donde DB_HOST de .env (el nombre del servicio) no resuelve
  const rawPort = env['MIGRATION_PORT'] ?? env['DB_PORT'] ?? '1433';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`The port must be a number between 1 and 65535, got "${rawPort}".`);
  }

  return {
    host: env['MIGRATION_HOST'] ?? env['DB_HOST'] ?? 'localhost',
    port,
    user: env['MIGRATION_USER'] ?? 'sa',
    password,
    database,
    trustServerCertificate: env['DB_TRUST_SERVER_CERTIFICATE'] !== 'false',
    ...loadAppLogin(env),
    ...loadSeed(env),
  };
}

function loadAppLogin(env: NodeJS.ProcessEnv): { appLogin?: AppLoginConfig } {
  const appPassword = env['DB_APP_PASSWORD'];
  if (appPassword === undefined || appPassword === '') return {};

  const user = env['DB_APP_USER'] ?? 'shopcart_app';
  if (!DATABASE_NAME.test(user)) {
    throw new Error(`DB_APP_USER "${user}" is not a valid login name.`);
  }
  if (appPassword.length < PASSWORD_MIN_LENGTH || appPassword.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `DB_APP_PASSWORD must have between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }
  return { appLogin: { user, password: appPassword } };
}

// Mismo mínimo que la API para registrar una contraseña (10); el máximo evita que argon2 trabaje con entradas enormes
const SEED_PASSWORD_MIN_LENGTH = 10;
const SEED_PASSWORD_VARIABLES = {
  adminPassword: 'SEED_ADMIN_PASSWORD',
  operatorPassword: 'SEED_OPERATOR_PASSWORD',
  customerPassword: 'SEED_CUSTOMER_PASSWORD',
} as const;

function loadSeed(env: NodeJS.ProcessEnv): { seed?: SeedConfig } {
  const flag = env['SEED_DEMO_DATA'] ?? '';
  if (flag === '' || flag === 'false') return {};
  if (flag !== 'true') {
    throw new Error(`SEED_DEMO_DATA must be true or false, got "${flag}".`);
  }

  // Nunca se escribe el valor de una contraseña en el mensaje: solo el nombre de la variable
  const read = (key: keyof SeedConfig): string => {
    const variable = SEED_PASSWORD_VARIABLES[key];
    const value = env[variable] ?? '';
    if (value === '') {
      throw new Error(
        `${variable} is empty: npm run up generates it in .env when SEED_DEMO_DATA is true.`,
      );
    }
    if (value.length < SEED_PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
      throw new Error(
        `${variable} must have between ${SEED_PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      );
    }
    return value;
  };
  return {
    seed: {
      adminPassword: read('adminPassword'),
      operatorPassword: read('operatorPassword'),
      customerPassword: read('customerPassword'),
    },
  };
}

/**
 * Las bases de pruebas (nombre terminado en _CI) son de tSQLt: sus fixtures usan los mismos correos que las cuentas de
 * demostración y suponen una base sin datos propios. El mismo sufijo ya lo exige SQL_TEST_DATABASE.
 */
export function isTestDatabase(database: string): boolean {
  return database.endsWith('_CI');
}
