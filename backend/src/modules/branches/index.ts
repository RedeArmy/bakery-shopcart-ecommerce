// Superficie pública del módulo branches: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlBranchesRepository } from './infrastructure/sql-branches-repository.js';
import { createBranchesRouter } from './presentation/branches.routes.js';

export { createBranchesRouter } from './presentation/branches.routes.js';
export type { BranchesRepository } from './application/branches-repository.js';

/** Módulo de tratamiento ligero (controlador → repositorio): las reglas viven en los procedimientos SP_Branches_*. */
export function createBranchesModule(kit: RouteKit): { router: Router } {
  return { router: createBranchesRouter(kit, createSqlBranchesRepository(kit.execute)) };
}
