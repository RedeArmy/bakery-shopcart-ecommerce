// Superficie pública del módulo catalogue: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlCatalogueRepository } from './infrastructure/sql-catalogue-repository.js';
import { createCatalogueRouter } from './presentation/catalogue.routes.js';

export { buildCategoryTree, createCatalogueRouter } from './presentation/catalogue.routes.js';
export type { CatalogueRepository } from './application/catalogue-repository.js';

/** Módulo de tratamiento ligero (controlador → repositorio): no hay lógica de negocio fuera de los procedimientos. */
export function createCatalogueModule(kit: RouteKit): { router: Router } {
  return { router: createCatalogueRouter(kit, createSqlCatalogueRepository(kit.execute)) };
}
