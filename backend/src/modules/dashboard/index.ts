// Superficie pública del módulo dashboard: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlDashboardRepository } from './infrastructure/sql-dashboard-repository.js';
import { createDashboardRouter } from './presentation/dashboard.routes.js';

export { createDashboardRouter } from './presentation/dashboard.routes.js';
export type { DashboardRepository } from './application/dashboard-repository.js';

/** Panel de métricas del administrador (RF-08), de tratamiento ligero: solo lectura, sin lógica fuera de la base de datos. */
export function createDashboardModule(kit: RouteKit): { router: Router } {
  return { router: createDashboardRouter(kit, createSqlDashboardRepository(kit.execute)) };
}
