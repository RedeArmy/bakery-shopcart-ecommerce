import type sql from 'mssql';
import { isDeadlock, mapSqlError } from './map-sql-error.js';
import type { Database } from './pool.js';

export interface ProcedureParam {
  name: string;
  type: sql.ISqlTypeFactoryWithNoParams | sql.ISqlType;
  value: unknown;
}

export interface ProcedureResult<T> {
  rows: T[];
  output: Record<string, unknown>;
}

const MAX_DEADLOCK_RETRIES = 2;
const BACKOFF_BASE_MS = 25;
const BACKOFF_CAP_MS = 200;

export interface ExecutorOptions {
  /** Espera entre reintentos; se inyecta para que las pruebas no dependan del reloj real. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Fuente de aleatoriedad en [0, 1); se inyecta para que las pruebas sean deterministas. */
  random?: () => number;
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Jitter completo: un valor uniforme entre 0 y el tope exponencial. Sin él, dos transacciones
 * que chocaron reintentarían a la vez y volverían a chocar.
 */
export function backoffDelay(attempt: number, random: () => number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

/**
 * Único punto de acceso a datos: todo SQL vive en procedimientos almacenados y los parámetros
 * siempre se envían tipados. Solo la capa infrastructure de cada módulo debe importar esto.
 */
export function createProcedureExecutor(database: Database, options: ExecutorOptions = {}) {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  return async function executeProcedure<T>(
    procedureName: string,
    params: ProcedureParam[] = [],
    outputs: Omit<ProcedureParam, 'value'>[] = [],
  ): Promise<ProcedureResult<T>> {
    for (let attempt = 0; ; attempt += 1) {
      const request = (await database.getPool()).request();
      for (const param of params) request.input(param.name, param.type, param.value);
      for (const output of outputs) request.output(output.name, output.type);
      try {
        const result = await request.execute<T>(procedureName);
        return { rows: result.recordset, output: result.output };
      } catch (error) {
        // El deadlock (1205) revierte la transacción completa del procedimiento: repetirlo es seguro
        if (!isDeadlock(error) || attempt >= MAX_DEADLOCK_RETRIES) throw mapSqlError(error);
        // El reintento solo puede ocurrir después de la espera, por eso es secuencial
        await sleep(backoffDelay(attempt, random));
      }
    }
  };
}
