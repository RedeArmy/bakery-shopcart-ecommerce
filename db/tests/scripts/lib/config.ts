export interface TestConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  reportPath: string;
}

// tSQLt cambia la configuración del SERVIDOR (clr enabled): solo se permite sobre un servidor local
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1']);

// La base de datos de pruebas termina en _CI: tSQLt nunca debe instalarse en la base entregada (ADR-0023)
const TEST_DATABASE = /^[A-Za-z][A-Za-z0-9_]{0,60}_CI$/;

const DEFAULT_PORT = '14333';
const DEFAULT_DATABASE = 'ShopCart_CI';
const DEFAULT_REPORT = 'test-results/tsqlt-junit.xml';

/** Lee y valida la configuración desde las variables de entorno; falla con un mensaje claro. */
export function loadConfig(env: NodeJS.ProcessEnv): TestConfig {
  const password = env['SQL_TEST_PASSWORD'] ?? env['MSSQL_SA_PASSWORD'];
  if (password === undefined || password === '') {
    throw new Error(
      'Set SQL_TEST_PASSWORD (or MSSQL_SA_PASSWORD in .env): the password of the sa login of the test server.',
    );
  }

  const host = env['SQL_TEST_HOST'] ?? 'localhost';
  if (!LOCAL_HOSTS.has(host) && env['SQL_TEST_ALLOW_REMOTE'] !== 'true') {
    throw new Error(
      `Refusing to run against "${host}": installing tSQLt changes server settings. Use a local, disposable server (or set SQL_TEST_ALLOW_REMOTE=true if you are sure).`,
    );
  }

  const database = env['SQL_TEST_DATABASE'] ?? DEFAULT_DATABASE;
  if (!TEST_DATABASE.test(database)) {
    throw new Error(
      `Refusing to install tSQLt in "${database}": the test database name must end in _CI so that it can never be the delivered database (ADR-0023).`,
    );
  }

  const port = Number(env['SQL_TEST_PORT'] ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `SQL_TEST_PORT must be a port number between 1 and 65535, got "${env['SQL_TEST_PORT'] ?? ''}".`,
    );
  }

  return {
    host,
    port,
    user: env['SQL_TEST_USER'] ?? 'sa',
    password,
    database,
    reportPath: env['SQL_TEST_REPORT'] ?? DEFAULT_REPORT,
  };
}
