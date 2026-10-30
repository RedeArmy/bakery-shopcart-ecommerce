import type { Express } from 'express';
import type { Env } from './platform/config/env.js';
import { createDatabase } from './platform/db/pool.js';
import type { Database } from './platform/db/pool.js';
import {
  REQUIRED_SCHEMA_VERSION,
  createSchemaVersionReader,
} from './platform/db/schema-version.js';
import { createApp } from './platform/http/app.js';
import { createReadiness } from './platform/http/readiness.js';
import { createLogger } from './platform/logging/logger.js';
import type { ReadinessReport } from './platform/http/readiness.js';
import type { Logger } from './platform/logging/logger.js';

export interface Container {
  app: Express;
  logger: Logger;
  database: Database;
  /** La misma comprobación que usa /health/ready; main.ts la ejecuta al arrancar para dejar constancia en el registro */
  checkReadiness: () => Promise<ReadinessReport>;
}

/**
 * Único lugar donde se conectan las clases concretas (inyección de dependencias manual).
 * Por ahora solo cablea la plataforma; cada módulo se añade aquí cuando tenga casos de uso.
 */
export function buildContainer(env: Env): Container {
  const logger = createLogger(env);
  const database = createDatabase(env);
  const checkReadiness = createReadiness({
    checkConnection: () => database.checkConnection(),
    readSchemaVersion: createSchemaVersionReader(database),
    requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
    logger,
  });
  const app = createApp({ env, logger, health: { checkReadiness } });
  return { app, logger, database, checkReadiness };
}
