import { Router } from 'express';

export interface HealthChecks {
  /** true cuando la base de datos responde (y, desde la Etapa 2, el esquema está al día). */
  isDatabaseReady(): Promise<boolean>;
}

export function createHealthRouter(checks: HealthChecks): Router {
  const router = Router();

  // Liveness: el proceso responde. No toca dependencias para no reiniciar el contenedor sin motivo
  router.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness: el tráfico solo debe llegar cuando la base de datos está disponible
  router.get('/health/ready', async (_req, res) => {
    const database = await checks.isDatabaseReady();
    res.status(database ? 200 : 503).json({
      status: database ? 'ok' : 'unavailable',
      checks: { database: database ? 'up' : 'down' },
    });
  });

  return router;
}
