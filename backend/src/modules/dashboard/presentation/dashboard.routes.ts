import { Router } from 'express';
import { z } from 'zod';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { pageQuery } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { DashboardRepository } from '../application/dashboard-repository.js';
import { DEFAULT_TOP, REPORT_FORMATS, collectReport } from '../application/report-export.js';
import type { ReportFormat, ReportWriters } from '../application/report-export.js';

const day = z.iso.date();

// Sin fechas la base de datos usa los últimos 30 días; con una sola, la otra se completa allí
const rangeQuery = z.object({ from: day.optional(), to: day.optional() });
const salesQuery = rangeQuery.extend({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});
const topQuery = rangeQuery.extend({ limit: z.coerce.number().int().min(1).max(50).default(10) });
const exportQuery = salesQuery.extend({
  format: z.enum(REPORT_FORMATS),
  limit: z.coerce.number().int().min(1).max(50).default(DEFAULT_TOP),
});

const FILES: Record<ReportFormat, { type: string; extension: string }> = {
  xlsx: {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  pdf: { type: 'application/pdf', extension: 'pdf' },
};

export function createDashboardRouter(
  kit: RouteKit,
  repository: DashboardRepository,
  writers: ReportWriters,
): Router {
  const router = Router();
  // Solo el administrador ve el panel, con el límite de 30 por minuto de docs/api/conventions.md
  const administrator = [
    kit.authenticate,
    kit.role('Administrator'),
    kit.rateLimit(POLICIES.dashboard),
  ];

  const rangeOf = (query: z.infer<typeof rangeQuery>) => ({
    from: query.from ?? null,
    to: query.to ?? null,
  });

  router.get('/admin/dashboard/summary', ...administrator, async (req, res) => {
    res.json(await repository.summary(rangeOf(rangeQuery.parse(req.query))));
  });

  router.get('/admin/dashboard/sales', ...administrator, async (req, res) => {
    const query = salesQuery.parse(req.query);
    res.json(await repository.salesByPeriod(rangeOf(query), query.granularity));
  });

  router.get('/admin/dashboard/sales-by-category', ...administrator, async (req, res) => {
    res.json(await repository.salesByCategory(rangeOf(rangeQuery.parse(req.query))));
  });

  router.get('/admin/dashboard/top-products', ...administrator, async (req, res) => {
    const query = topQuery.parse(req.query);
    res.json(await repository.topProducts(rangeOf(query), query.limit));
  });

  // El mismo reporte que ve el panel, como archivo: pasa por el mismo repositorio (y su caché) que las pantallas
  router.get('/admin/dashboard/export', ...administrator, async (req, res) => {
    const query = exportQuery.parse(req.query);
    const report = await collectReport(
      repository,
      rangeOf(query),
      query.granularity,
      query.limit,
      kit.clock.now(),
    );
    const file = FILES[query.format];
    const name = `reporte-ventas-${report.subtitle.replaceAll(/[^0-9-]+/g, '_').replaceAll(/^_+|_+$/g, '')}.${file.extension}`;
    res
      .status(200)
      .set({
        'Content-Type': file.type,
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      })
      .send(writers[query.format].write(report));
  });

  router.get('/admin/dashboard/abandoned-carts', ...administrator, async (req, res) => {
    const query = pageQuery.parse(req.query);
    res.json(await repository.abandonedCarts(query.page, query.size));
  });

  return router;
}
