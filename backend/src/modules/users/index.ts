// Superficie pública del módulo users: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import { createSqlUsersRepository } from './infrastructure/sql-users-repository.js';
import { createUsersRouter } from './presentation/users.routes.js';

export { createUsersRouter } from './presentation/users.routes.js';
export type { UsersRepository } from './application/users-repository.js';

/** Direcciones del cliente y administración de cuentas (tratamiento ligero). */
export function createUsersModule(kit: RouteKit): { router: Router } {
  return { router: createUsersRouter(kit, createSqlUsersRepository(kit.execute)) };
}
