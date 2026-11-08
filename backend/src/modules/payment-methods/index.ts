// Superficie pública del módulo payment-methods: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlPaymentMethodsRepository } from './infrastructure/sql-payment-methods-repository.js';
import { createPaymentMethodsRouter } from './presentation/payment-methods.routes.js';

export { createPaymentMethodsRouter } from './presentation/payment-methods.routes.js';
export type { PaymentMethodsRepository } from './application/payment-methods-repository.js';

/** Módulo de tratamiento ligero (controlador → repositorio): las reglas viven en los procedimientos SP_PaymentMethods_*. */
export function createPaymentMethodsModule(kit: RouteKit): { router: Router } {
  return {
    router: createPaymentMethodsRouter(kit, createSqlPaymentMethodsRepository(kit.execute)),
  };
}
