import type { JobDefinition } from './job-runner.js';

/** Puerto de los trabajos: cada método es un procedimiento que toma su propio bloqueo y devuelve lo que hizo. */
export interface JobsPort {
  expirePayments(batchSize: number): Promise<{
    outcome: 'Ran' | 'Skipped';
    expiredOrders: number;
    releasedReservations: number;
  }>;
  purgeExpired(): Promise<{ outcome: 'Ran' | 'Skipped'; purgedIdempotency: number }>;
  reconcile(): Promise<{
    outcome: 'Ran' | 'Skipped';
    amountDiscrepancies: number;
    inventoryDiscrepancies: number;
  }>;
}

export interface JobsConfig {
  expireEverySeconds: number;
  purgeEveryHours: number;
  reconcileEveryHours: number;
}

const SECOND = 1000;
const HOUR = 3600 * SECOND;
/** Pedidos que cancela una ejecución como máximo: si hay un atraso enorme la siguiente vuelta continúa */
const EXPIRE_BATCH_SIZE = 100;

/**
 * Los trabajos de la Fase 1 (docs/architecture/03-backend-lld.md). Los de tarjeta (conciliar, sondear la pasarela)
 * llegan con la Fase 2.
 */
export function buildJobs(port: JobsPort, config: JobsConfig): JobDefinition[] {
  return [
    {
      // Vence los pagos pendientes y devuelve las reservas de carritos que nunca confirmaron
      name: 'expirePayments',
      intervalMs: config.expireEverySeconds * SECOND,
      startDelayMs: 5 * SECOND,
      run: async () => {
        const result = await port.expirePayments(EXPIRE_BATCH_SIZE);
        return {
          outcome: result.outcome,
          counts: {
            expiredOrders: result.expiredOrders,
            releasedReservations: result.releasedReservations,
          },
        };
      },
    },
    {
      name: 'purgeExpired',
      intervalMs: config.purgeEveryHours * HOUR,
      startDelayMs: 30 * SECOND,
      run: async () => {
        const result = await port.purgeExpired();
        return { outcome: result.outcome, counts: { purgedIdempotency: result.purgedIdempotency } };
      },
    },
    {
      // Los importes y el inventario deben cuadrar siempre: cualquier fila es una alerta, no un dato más
      name: 'reconcileAmounts',
      intervalMs: config.reconcileEveryHours * HOUR,
      startDelayMs: 60 * SECOND,
      run: async () => {
        const result = await port.reconcile();
        const total = result.amountDiscrepancies + result.inventoryDiscrepancies;
        return {
          outcome: result.outcome,
          counts: {
            amountDiscrepancies: result.amountDiscrepancies,
            inventoryDiscrepancies: result.inventoryDiscrepancies,
          },
          ...(total > 0
            ? {
                alert:
                  'Reconciliation found discrepancies; see the audit log and /admin/system/reconciliation',
              }
            : {}),
        };
      },
    },
  ];
}
