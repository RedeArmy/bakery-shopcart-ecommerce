import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow, toPage } from '../../../platform/http/serialise.js';
import type { Page, Row } from '../../../platform/http/serialise.js';
import type {
  OrderFilter,
  OrdersRepository,
  ReturnLineInput,
} from '../application/orders-repository.js';

/** Adaptador SQL de los pedidos: la pertenencia se comprueba dentro de cada procedimiento con el actor del token. */
export function createSqlOrdersRepository(execute: ProcedureExecutor): OrdersRepository {
  return {
    async list(filter: OrderFilter): Promise<Page<Row>> {
      const result = await execute<Row>('dbo.SP_Orders_List', [
        { name: 'IDActor', type: sql.Int, value: filter.actor },
        { name: 'AsStaff', type: sql.Bit, value: filter.asStaff },
        { name: 'IDOrderStatus', type: sql.TinyInt, value: filter.statusId },
        { name: 'Search', type: sql.NVarChar(100), value: filter.search },
        { name: 'From', type: sql.DateTime2(3), value: filter.from },
        { name: 'To', type: sql.DateTime2(3), value: filter.to },
        { name: 'PageNumber', type: sql.Int, value: filter.page },
        { name: 'PageSize', type: sql.Int, value: filter.size },
      ]);
      return toPage(result.rows, filter.page, filter.size);
    },

    async detail(actor: number, asStaff: boolean, idOrder: number): Promise<Row> {
      const result = await execute<Row>('dbo.SP_Orders_GetDetail', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'AsStaff', type: sql.Bit, value: asStaff },
        { name: 'IDOrder', type: sql.Int, value: idOrder },
      ]);
      const row = result.rows[0];
      if (row === undefined) throw new TypeError('SP_Orders_GetDetail returned no row');
      return camelRow(row, ['Lines', 'History']);
    },

    async cancel(actor: number, idOrder: number, reason: string): Promise<void> {
      await execute('dbo.SP_Orders_Cancel', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDOrder', type: sql.Int, value: idOrder },
        { name: 'Reason', type: sql.NVarChar(250), value: reason },
      ]);
    },

    async changeStatus(
      actor: number,
      idOrder: number,
      status: number,
      comment: string | null,
    ): Promise<void> {
      await execute('dbo.SP_Orders_ChangeStatus', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDOrder', type: sql.Int, value: idOrder },
        { name: 'NewStatus', type: sql.TinyInt, value: status },
        { name: 'Comment', type: sql.NVarChar(250), value: comment },
      ]);
    },

    async registerReturn(
      actor: number,
      idOrder: number,
      reason: string,
      lines: readonly ReturnLineInput[],
    ): Promise<{ idReturn: number; idRefund: number; refundAmount: string }> {
      const result = await execute(
        'dbo.SP_Returns_Register',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'IDOrder', type: sql.Int, value: idOrder },
          { name: 'Reason', type: sql.NVarChar(250), value: reason },
          { name: 'Lines', type: sql.NVarChar(sql.MAX), value: JSON.stringify(lines) },
        ],
        [
          { name: 'IDReturn', type: sql.Int },
          { name: 'IDRefund', type: sql.Int },
          { name: 'RefundAmountText', type: sql.VarChar(25) },
        ],
      );
      return {
        idReturn: result.output['IDReturn'] as number,
        idRefund: result.output['IDRefund'] as number,
        // El importe ya viene como texto de dos decimales desde la base de datos: nunca pasa por un número de coma flotante
        refundAmount: result.output['RefundAmountText'] as string,
      };
    },
  };
}
