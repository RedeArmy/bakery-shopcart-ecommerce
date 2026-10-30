// Superficie pública del módulo audit: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlAuditRepository } from './infrastructure/sql-audit-repository.js';
import { createAuditRouter } from './presentation/audit.routes.js';

export { createAuditRouter } from './presentation/audit.routes.js';
export type { AuditRepository } from './application/audit-repository.js';

/** Bitácora de auditoría y versión del sistema (solo lectura, solo administrador). */
export function createAuditModule(kit: RouteKit, appVersion: string): { router: Router } {
  return { router: createAuditRouter(kit, createSqlAuditRepository(kit.execute), appVersion) };
}
