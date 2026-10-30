// Superficie pública del módulo inventory: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlInventoryRepository } from './infrastructure/sql-inventory-repository.js';
import { createInventoryRouter } from './presentation/inventory.routes.js';

export { createInventoryRouter } from './presentation/inventory.routes.js';
export type { InventoryRepository } from './application/inventory-repository.js';

/** Libro de inventario para el personal; la reserva y el descuento por venta los hacen los módulos de compra. */
export function createInventoryModule(kit: RouteKit): { router: Router } {
  return { router: createInventoryRouter(kit, createSqlInventoryRepository(kit.execute)) };
}
