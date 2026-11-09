import type { Logger } from '../logging/logger.js';
import { createProcedureExecutor } from './execute-procedure.js';
import type { Database } from './pool.js';

type ProcedureExecutorFactory = typeof createProcedureExecutor;

/**
 * Calienta la base de datos al arrancar: la primera conversión de zona horaria de SQL Server tarda varios segundos y, sin esto,
 * la paga el primer cliente que llega al pago. Nunca rechaza: si falla solo se registra, porque el servicio funciona igual
 * y esa primera petición será más lenta. Construye su propio ejecutor, como el lector de la versión del esquema, porque la regla
 * de arquitectura solo deja usar execute-procedure a platform/db y a la capa infrastructure de los módulos.
 */
export function createWarmUp(
  database: Database,
  logger: Logger,
  executorFactory: ProcedureExecutorFactory = createProcedureExecutor,
): () => Promise<void> {
  const execute = executorFactory(database);
  return async () => {
    const started = Date.now();
    try {
      await execute('dbo.SP_System_WarmUp');
      logger.info({ milliseconds: Date.now() - started }, 'Database warm-up finished');
    } catch (error) {
      logger.warn({ err: error }, 'Database warm-up failed; the first checkout may be slower');
    }
  };
}
