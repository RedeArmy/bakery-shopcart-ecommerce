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
