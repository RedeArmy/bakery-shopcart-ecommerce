// Decisiones del banco de rendimiento, sin conexión para poder probarlas (el ejecutor está en run-bench.ts).

/** Suma las "logical reads" que SET STATISTICS IO imprime, una línea por tabla. */
export function logicalReads(messages: readonly string[]): number {
  let total = 0;
  for (const message of messages) {
    for (const match of message.matchAll(/logical reads (\d+)/g)) total += Number(match[1]);
  }
  return total;
}

export interface BenchCase {
  name: string;
  /** Lote que ejecuta una sola vez el procedimiento medido */
  sql: string;
  /** Lecturas lógicas máximas: es la medida estable, no depende de la máquina */
  maxReads: number;
  /** Tiempo máximo en milisegundos; sin valor, el segundo que pide el enunciado */
  maxMilliseconds?: number;
}

/** El enunciado pide que los listados y reportes principales respondan en menos de un segundo. */
export const MAX_MILLISECONDS = 1000;

export interface BenchResult {
  name: string;
  reads: number;
  milliseconds: number;
}

/** Devuelve el problema de una medición, o undefined si está dentro de sus límites. */
export function assess(benchCase: BenchCase, result: BenchResult): string | undefined {
  if (result.reads > benchCase.maxReads) {
    return `${benchCase.name}: ${result.reads} logical reads, the limit is ${benchCase.maxReads}`;
  }
  const limit = benchCase.maxMilliseconds ?? MAX_MILLISECONDS;
  if (result.milliseconds > limit) {
    return `${benchCase.name}: ${Math.round(result.milliseconds)} ms, the limit is ${limit}`;
  }
  return undefined;
}

/** La base de volumen es siempre una aparte: el nombre termina en _Bench para que nunca sea la entregada ni la de tSQLt. */
const BENCH_DATABASE = /^[A-Za-z]\w{0,56}_Bench$/;

export function assertBenchDatabase(name: string): string {
  if (!BENCH_DATABASE.test(name)) {
    throw new Error(
      `Refusing to load volume data into "${name}": the benchmark database name must end in _Bench.`,
    );
  }
  return name;
}

// La carga de volumen inserta miles de filas con sa y cambia la base: solo se permite sobre un servidor local y desechable
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1']);

export interface BenchSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  trustServerCertificate: boolean;
  database: string;
}

/** Lee y valida la conexión del banco desde el entorno; falla con un mensaje claro en lugar de cargar datos donde no debe. */
export function loadBenchSettings(env: NodeJS.ProcessEnv): BenchSettings {
  const password = env['SQL_TEST_PASSWORD'] ?? env['MSSQL_SA_PASSWORD'];
  if (password === undefined || password === '') {
    throw new Error(
      'Set SQL_TEST_PASSWORD (or MSSQL_SA_PASSWORD in .env): the sa password of the test server.',
    );
  }
  const host = env['SQL_TEST_HOST'] ?? 'localhost';
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to load volume data into "${host}": use the local test server.`);
  }
  const port = Number(env['SQL_TEST_PORT'] ?? '14333');
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
    trustServerCertificate: true,
    database: assertBenchDatabase(env['SQL_BENCH_DATABASE'] ?? 'ShopCart_Bench'),
  };
}
