// Superficie pública del módulo checkout: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { CheckoutService } from './application/checkout-service.js';
import { createSqlCheckoutRepository } from './infrastructure/sql-checkout-repository.js';
import { createCheckoutRouter } from './presentation/checkout.routes.js';

export { CheckoutService, storedKeyOf } from './application/checkout-service.js';
export type { CheckoutRepositoryPort } from './application/checkout-service.js';
export { createCheckoutRouter } from './presentation/checkout.routes.js';

export interface CheckoutModuleOptions {
  /** Fase 1: false. La Fase 2 lo activa cuando hay credenciales de Recurrente */
  cardAvailable: boolean;
}

export function createCheckoutModule(
  kit: RouteKit,
  options: CheckoutModuleOptions,
): { router: Router } {
  const service = new CheckoutService(
    createSqlCheckoutRepository(kit.execute),
    options.cardAvailable,
  );
  return { router: createCheckoutRouter(kit, service) };
}
