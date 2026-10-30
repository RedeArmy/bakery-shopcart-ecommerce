import sql from 'mssql';
import type { JobsPort } from '../jobs/job-definitions.js';
import type { ProcedureExecutor } from './execute-procedure.js';

type Outcome = 'Ran' | 'Skipped';

/** Adaptador SQL de los trabajos: el bloqueo de ejecución única y el trabajo mismo viven en SP_Jobs_*. */
export function createSqlJobs(execute: ProcedureExecutor): JobsPort {
  return {
    async expirePayments(batchSize) {
      const result = await execute(
        'dbo.SP_Jobs_ExpirePayments',
        [{ name: 'BatchSize', type: sql.Int, value: batchSize }],
        [
          { name: 'Outcome', type: sql.VarChar(10) },
          { name: 'ExpiredOrders', type: sql.Int },
          { name: 'ReleasedReservations', type: sql.Int },
        ],
      );
      return {
        outcome: result.output['Outcome'] as Outcome,
        expiredOrders: Number(result.output['ExpiredOrders'] ?? 0),
        releasedReservations: Number(result.output['ReleasedReservations'] ?? 0),
      };
    },

    async purgeExpired() {
      const result = await execute(
        'dbo.SP_Jobs_PurgeExpired',
        [],
        [
          { name: 'Outcome', type: sql.VarChar(10) },
          { name: 'PurgedIdempotency', type: sql.Int },
        ],
      );
      return {
        outcome: result.output['Outcome'] as Outcome,
        purgedIdempotency: Number(result.output['PurgedIdempotency'] ?? 0),
      };
    },

    async reconcile() {
      const result = await execute(
        'dbo.SP_Jobs_ReconcileAmounts',
        [],
        [
          { name: 'Outcome', type: sql.VarChar(10) },
          { name: 'AmountDiscrepancies', type: sql.Int },
          { name: 'InventoryDiscrepancies', type: sql.Int },
        ],
      );
      return {
        outcome: result.output['Outcome'] as Outcome,
        amountDiscrepancies: Number(result.output['AmountDiscrepancies'] ?? 0),
        inventoryDiscrepancies: Number(result.output['InventoryDiscrepancies'] ?? 0),
      };
    },
  };
}
