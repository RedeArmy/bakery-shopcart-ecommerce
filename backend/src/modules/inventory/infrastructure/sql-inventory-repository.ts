import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { toPage } from '../../../platform/http/serialise.js';
import type { Page, Row } from '../../../platform/http/serialise.js';
import type { InventoryRepository } from '../application/inventory-repository.js';

/** Adaptador SQL del libro de inventario: el stock solo entra y sale por estos procedimientos, nunca por UPDATE directo. */
export function createSqlInventoryRepository(execute: ProcedureExecutor): InventoryRepository {
  return {
    async ledger(
      idVariant: number,
      range: { from: Date | null; to: Date | null },
      page: number,
      size: number,
    ): Promise<Page<Row>> {
      const result = await execute<Row>('dbo.SP_Inventory_GetLedger', [
        { name: 'IDVariant', type: sql.Int, value: idVariant },
        { name: 'From', type: sql.DateTime2(3), value: range.from },
        { name: 'To', type: sql.DateTime2(3), value: range.to },
        { name: 'PageNumber', type: sql.Int, value: page },
        { name: 'PageSize', type: sql.Int, value: size },
      ]);
      return toPage(result.rows, page, size);
    },

    async registerEntry(
      actor: number,
      idVariant: number,
      quantity: number,
      reason: string,
    ): Promise<string> {
      const result = await execute(
        'dbo.SP_Inventory_RegisterEntry',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'IDVariant', type: sql.Int, value: idVariant },
          { name: 'Quantity', type: sql.Int, value: quantity },
          { name: 'Reason', type: sql.NVarChar(250), value: reason },
        ],
        [{ name: 'IDMovement', type: sql.BigInt }],
      );
      return String(result.output['IDMovement']);
    },

    /** Devuelve null cuando el stock ya era el pedido y no hubo movimiento que registrar. */
    async adjust(
      actor: number,
      idVariant: number,
      newOnHand: number,
      reason: string,
    ): Promise<string | null> {
      const result = await execute(
        'dbo.SP_Inventory_AdjustStock',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'IDVariant', type: sql.Int, value: idVariant },
          { name: 'NewOnHand', type: sql.Int, value: newOnHand },
          { name: 'Reason', type: sql.NVarChar(250), value: reason },
        ],
        [{ name: 'IDMovement', type: sql.BigInt }],
      );
      const movement = result.output['IDMovement'] as number | string | null | undefined;
      return movement === null || movement === undefined ? null : String(movement);
    },
  };
}
