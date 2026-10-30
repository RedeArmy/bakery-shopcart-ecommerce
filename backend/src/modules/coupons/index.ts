// Superficie pública del módulo coupons: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlCouponsRepository } from './infrastructure/sql-coupons-repository.js';
import { createCouponsRouter } from './presentation/coupons.routes.js';

export { createCouponsRouter } from './presentation/coupons.routes.js';
export type { CouponsRepository } from './application/coupons-repository.js';

/** Administración de cupones (tratamiento ligero); aplicar un cupón al carrito es del módulo cart. */
export function createCouponsModule(kit: RouteKit): { router: Router } {
  return { router: createCouponsRouter(kit, createSqlCouponsRepository(kit.execute)) };
}
