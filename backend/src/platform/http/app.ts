import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import { createErrorHandler, notFoundHandler } from './error-handler.js';
import { createHealthRouter } from './health.routes.js';
import type { HealthChecks } from './health.routes.js';
import { requestId } from './request-id.js';

export interface AppDependencies {
  env: Pick<Env, 'CORS_ORIGINS'>;
  logger: Logger;
  health: HealthChecks;
}

export function createApp({ env, logger, health }: AppDependencies): Express {
  const app = express();

  // nginx es el único proxy de confianza; así X-Forwarded-For no puede falsearse desde fuera
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

  // El webhook de Recurrente (Fase 2) se monta ANTES de express.json() porque necesita el cuerpo sin parsear
  app.use(express.json({ limit: '100kb' }));

  app.use(createHealthRouter(health));
  // Las rutas de /api/v1 se registran aquí a medida que los módulos se implementan

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
