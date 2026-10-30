// Superficie pública del módulo payments: ningún otro módulo puede importar nada más que este archivo
import type { Router } from 'express';
import type { RouteKit } from '../../platform/http/route-kit.js';
import type { FileStoragePort } from '../../platform/storage/local-disk-storage.js';
import { PaymentsService } from './application/payments-service.js';
import { createSqlPaymentsRepository } from './infrastructure/sql-payments-repository.js';
import { createPaymentsRouter } from './presentation/payments.routes.js';

export { PaymentsService, safeFileName } from './application/payments-service.js';
export type { PaymentsRepositoryPort } from './application/payments-service.js';
export { createPaymentsRouter } from './presentation/payments.routes.js';

/** Depósitos bancarios: comprobantes, revisión del personal, cuentas y reembolsos. La tarjeta llega en la Fase 2. */
export function createPaymentsModule(kit: RouteKit, storage: FileStoragePort): { router: Router } {
  const repository = createSqlPaymentsRepository(kit.execute);
  const service = new PaymentsService(repository, storage);
  return { router: createPaymentsRouter(kit, repository, service) };
}
