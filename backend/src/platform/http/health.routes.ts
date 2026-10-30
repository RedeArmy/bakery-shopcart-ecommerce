import { Router } from 'express';
import type { ReadinessReport } from './readiness.js';

export interface HealthChecks {
  /** La base de datos responde y su esquema es al menos el que el código necesita. */
  checkReadiness(): Promise<ReadinessReport>;
}

export function createHealthRouter(checks: HealthChecks): Router {
  const router = Router();

  // Liveness: el proceso responde. No toca dependencias para no reiniciar el contenedor sin motivo
  router.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness: el tráfico solo debe llegar cuando la base de datos está disponible y su esquema está al día.
  // No se expone ningún número de versión: la sonda es pública y los números van al registro del servidor.
  router.get('/health/ready', async (_req, res) => {
    const report = await checks.checkReadiness();
    const ready = report.database === 'up' && report.schema === 'ok';
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'unavailable',
      checks: report,
    });
  });

  return router;
}
