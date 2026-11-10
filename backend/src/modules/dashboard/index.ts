// Superficie pública del módulo dashboard: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import {
  createCachedDashboardRepository,
  DEFAULT_REPORT_CACHE,
} from './application/cached-dashboard-repository.js';
import { pdfWriter } from './infrastructure/report-files/pdf.js';
import { xlsxWriter } from './infrastructure/report-files/xlsx.js';
import { createSqlDashboardRepository } from './infrastructure/sql-dashboard-repository.js';
import { createDashboardRouter } from './presentation/dashboard.routes.js';

export { createDashboardRouter } from './presentation/dashboard.routes.js';
export type { DashboardRepository } from './application/dashboard-repository.js';

/** Panel de métricas del administrador (RF-08), de tratamiento ligero: solo lectura, sin lógica fuera de la base de datos. */
export function createDashboardModule(kit: RouteKit): { router: Router } {
  // Los reportes se guardan mientras no cambien los datos (la base de datos dice cuándo): el panel y los archivos comparten el caché
  const repository = createCachedDashboardRepository(createSqlDashboardRepository(kit.execute), {
    ...DEFAULT_REPORT_CACHE,
    now: () => kit.clock.now().getTime(),
  });
  return { router: createDashboardRouter(kit, repository, { xlsx: xlsxWriter, pdf: pdfWriter }) };
}
