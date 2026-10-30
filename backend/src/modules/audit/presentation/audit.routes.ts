import { Router } from 'express';
import { z } from 'zod';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import type { JobStatus } from '../../../platform/jobs/job-runner.js';
import { pageQuery } from '../../../platform/http/serialise.js';
import type { AuditRepository } from '../application/audit-repository.js';

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const auditQuery = pageQuery.extend({
  module: z.string().trim().min(1).max(30).optional(),
  entityKey: z.string().trim().max(40).optional(),
  from: instant.optional(),
  to: instant.optional(),
});

export function createAuditRouter(
  kit: RouteKit,
  repository: AuditRepository,
  appVersion: string,
  jobStatus: () => JobStatus[],
): Router {
  const router = Router();
  // Consultar la bitácora y la versión es solo del administrador y tiene un límite más estricto (docs/api/conventions.md)
  const administrator = [
    kit.authenticate,
    kit.role('Administrator'),
    kit.rateLimit({ name: 'audit', limit: 30, windowMs: 60_000 }),
  ];

  router.get('/admin/audit-log', ...administrator, async (req, res) => {
    const query = auditQuery.parse(req.query);
    res.json(
      await repository.query({
        module: query.module ?? null,
        entityKey: query.entityKey ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        page: query.page,
        size: query.size,
      }),
    );
  });

  router.get('/admin/system/version', ...administrator, async (_req, res) => {
    res.json({ app: appVersion, ...(await repository.systemVersion()) });
  });

  // Estado de los trabajos de ESTA instancia: el bloqueo vive en la base de datos, pero el historial de ejecuciones no
  router.get('/admin/system/jobs', ...administrator, (_req, res) => {
    res.json(jobStatus());
  });

  // Lo que la conciliación diaria marca como alerta; vacío cuando los importes y el inventario cuadran
  router.get('/admin/system/reconciliation', ...administrator, async (req, res) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
      .parse(req.query);
    res.json(await repository.reconciliation(limit));
  });

  return router;
}
