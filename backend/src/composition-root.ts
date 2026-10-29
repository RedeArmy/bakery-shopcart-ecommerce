import type { Express } from 'express';
import type { Env } from './platform/config/env.js';
import { createDatabase } from './platform/db/pool.js';
import type { Database } from './platform/db/pool.js';
import { createApp } from './platform/http/app.js';
import { createLogger } from './platform/logging/logger.js';
import type { Logger } from './platform/logging/logger.js';

export interface Container {
  app: Express;
  logger: Logger;
  database: Database;
}

/**
 * Único lugar donde se conectan las clases concretas (inyección de dependencias manual).
 * Por ahora solo cablea la plataforma; cada módulo se añade aquí cuando tenga casos de uso.
 */
export function buildContainer(env: Env): Container {
  const logger = createLogger(env);
  const database = createDatabase(env);
  const app = createApp({
    env,
    logger,
    health: { isDatabaseReady: () => database.checkConnection() },
  });
  return { app, logger, database };
}
