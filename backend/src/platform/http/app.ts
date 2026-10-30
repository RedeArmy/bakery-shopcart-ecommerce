import cors from 'cors';
import express from 'express';
import type { Express, RequestHandler, Router } from 'express';
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
  /** Rutas de /api/v1 de cada módulo y el límite global que las precede; los health checks quedan fuera */
  api?: { routers: Router[]; globalLimit: RequestHandler };
}

export function createApp({ env, logger, health, api }: AppDependencies): Express {
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
  if (api !== undefined) app.use('/api/v1', api.globalLimit, ...api.routers);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
