// Superficie pública del módulo cart: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlCartRepository } from './infrastructure/sql-cart-repository.js';
import { createCartRouter } from './presentation/cart.routes.js';

export { createCartRouter } from './presentation/cart.routes.js';
export type { CartRepository } from './application/cart-repository.js';

/** Módulo de tratamiento ligero: los totales, el cupón y la reserva viven en los procedimientos. */
export function createCartModule(kit: RouteKit): { router: Router } {
  return { router: createCartRouter(kit, createSqlCartRepository(kit.execute)) };
}
