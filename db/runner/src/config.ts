/** Login de la aplicación: solo ejecuta procedimientos y no puede tocar tablas (ADR-0002). */
export interface AppLoginConfig {
  user: string;
  password: string;
}

export interface RunnerConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Presente solo si DB_APP_PASSWORD está definida; en el CI no existe y no se crea ningún login */
  appLogin?: AppLoginConfig;
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
    ...loadAppLogin(env),
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
