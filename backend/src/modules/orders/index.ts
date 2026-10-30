// Superficie pública del módulo orders: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlOrdersRepository } from './infrastructure/sql-orders-repository.js';
import { createOrdersRouter } from './presentation/orders.routes.js';

export { createOrdersRouter } from './presentation/orders.routes.js';
export type { OrdersRepository } from './application/orders-repository.js';

/**
 * Pedidos del cliente y del personal. Las reglas (transiciones, cancelación, límites de devolución) viven en los
 * procedimientos; aquí solo se valida la forma de la solicitud y se entrega el actor del token.
 */
export function createOrdersModule(kit: RouteKit): { router: Router } {
  return { router: createOrdersRouter(kit, createSqlOrdersRepository(kit.execute)) };
}
