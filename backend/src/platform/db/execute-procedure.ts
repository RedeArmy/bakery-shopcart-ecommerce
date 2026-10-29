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

/**
 * Único punto de acceso a datos: todo SQL vive en procedimientos almacenados y los parámetros
 * siempre se envían tipados. Solo la capa infrastructure de cada módulo debe importar esto.
 */
export function createProcedureExecutor(database: Database) {
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
        if (isDeadlock(error) && attempt < MAX_DEADLOCK_RETRIES) continue;
        throw mapSqlError(error);
      }
    }
  };
}
