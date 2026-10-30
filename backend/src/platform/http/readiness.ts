import type { Logger } from '../logging/logger.js';

export type SchemaState = 'ok' | 'outdated' | 'unknown';

export interface ReadinessReport {
  database: 'up' | 'down';
  /** unknown: no se pudo leer (base caída o procedimiento ausente); outdated: el esquema va por detrás del código */
  schema: SchemaState;
}

export interface ReadinessDependencies {
  /** Comprueba la conectividad con la base de datos */
  checkConnection: () => Promise<boolean>;
  /** Número de la última migración aplicada */
  readSchemaVersion: () => Promise<number>;
  /** Versión que el código necesita como mínimo */
  requiredSchemaVersion: number;
  logger: Logger;
}

/**
 * Decide si el servicio puede recibir tráfico: la base responde y el esquema es al menos el que el código necesita.
 * Las migraciones solo avanzan, así que un esquema que ya cumplió el requisito lo seguirá cumpliendo mientras viva el
 * proceso: ese resultado se recuerda y las sondas siguientes no vuelven a consultar la base más que para la conexión.
 */
export function createReadiness(
  dependencies: ReadinessDependencies,
): () => Promise<ReadinessReport> {
  const { checkConnection, readSchemaVersion, requiredSchemaVersion, logger } = dependencies;
  let satisfied = false;
  // Para registrar solo los cambios de estado: una sonda cada pocos segundos llenaría el registro de lo mismo
  let lastLogged: SchemaState | undefined;

  const report = (schema: SchemaState, details?: Record<string, number>): void => {
    if (schema === lastLogged) return;
    lastLogged = schema;
    if (schema === 'outdated') {
      logger.error({ ...details }, 'Database schema is behind the application; not ready');
    } else if (schema === 'unknown') {
      logger.warn('Could not read the database schema version; not ready');
    } else {
      logger.info({ ...details }, 'Database schema meets the application requirement');
    }
  };

  return async () => {
    if (!(await checkConnection())) return { database: 'down', schema: 'unknown' };
    if (satisfied) return { database: 'up', schema: 'ok' };

    let current: number;
    try {
      current = await readSchemaVersion();
    } catch {
      report('unknown');
      return { database: 'up', schema: 'unknown' };
    }

    const details = { current, required: requiredSchemaVersion };
    if (current < requiredSchemaVersion) {
      report('outdated', details);
      return { database: 'up', schema: 'outdated' };
    }
    satisfied = true;
    report('ok', details);
    return { database: 'up', schema: 'ok' };
  };
}
