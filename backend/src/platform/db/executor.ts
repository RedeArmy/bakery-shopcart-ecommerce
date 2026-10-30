import { createProcedureExecutor } from './execute-procedure.js';
import type { Database } from './pool.js';

export type { ProcedureExecutor } from './execute-procedure.js';

/**
 * La raíz de composición no puede importar execute-procedure.ts (lo vigila dependency-cruiser): este es el punto
 * por el que crea el ejecutor único que luego inyecta en los repositorios de cada módulo.
 */
export function createExecutor(database: Database) {
  return createProcedureExecutor(database);
}
