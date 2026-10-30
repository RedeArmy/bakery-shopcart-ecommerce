import { createProcedureExecutor } from './execute-procedure.js';
import type { Database } from './pool.js';

/**
 * Versión del esquema que esta versión del código necesita: el número de la última migración de la que depende.
 * Vive en el código y no en una variable de entorno para que cambie en el mismo commit que el procedimiento
 * que exige la migración nueva; una variable se olvidaría y dejaría pasar un esquema atrasado.
 * Súbala al añadir código que dependa de una migración posterior (hay una prueba que impide pasarse de la última).
 */
export const REQUIRED_SCHEMA_VERSION = 10;

type ProcedureExecutorFactory = typeof createProcedureExecutor;

/**
 * Lee la versión del esquema por el procedimiento almacenado: la aplicación no tiene SELECT sobre las tablas.
 * Construye su propio ejecutor porque la regla de arquitectura solo deja usar execute-procedure a platform/db
 * y a la capa infrastructure de los módulos, no a la raíz de composición. La fábrica se inyecta para las pruebas.
 */
export function createSchemaVersionReader(
  database: Database,
  executorFactory: ProcedureExecutorFactory = createProcedureExecutor,
): () => Promise<number> {
  const execute = executorFactory(database);
  return async () => {
    const result = await execute<{ SchemaVersion: number }>('dbo.SP_System_GetSchemaVersion');
    const version = result.rows[0]?.SchemaVersion;
    if (typeof version !== 'number') {
      throw new TypeError('SP_System_GetSchemaVersion returned no version');
    }
    return version;
  };
}
