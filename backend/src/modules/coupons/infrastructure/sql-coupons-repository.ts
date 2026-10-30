import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { toPage } from '../../../platform/http/serialise.js';
import type { Page, Row } from '../../../platform/http/serialise.js';
import type { CouponInput, CouponsRepository } from '../application/coupons-repository.js';

const fields = (input: CouponInput) => [
  { name: 'Type', type: sql.NVarChar(12), value: input.type },
  { name: 'Value', type: sql.Decimal(18, 2), value: input.value },
  { name: 'MinimumAmount', type: sql.Decimal(18, 2), value: input.minimumAmount },
  { name: 'StartsAt', type: sql.DateTime2(3), value: input.startsAt },
  { name: 'EndsAt', type: sql.DateTime2(3), value: input.endsAt },
  { name: 'TotalUsageLimit', type: sql.Int, value: input.totalUsageLimit },
  { name: 'PerCustomerUsageLimit', type: sql.Int, value: input.perCustomerUsageLimit },
  { name: 'IDCategory', type: sql.Int, value: input.categoryId },
];

/** Adaptador SQL de los cupones: la vigencia, los límites y el descuento los decide la base de datos. */
export function createSqlCouponsRepository(execute: ProcedureExecutor): CouponsRepository {
  return {
    async list(includeInactive: boolean, page: number, size: number): Promise<Page<Row>> {
      const result = await execute<Row>('dbo.SP_Coupons_List', [
        { name: 'IncludeInactive', type: sql.Bit, value: includeInactive },
        { name: 'PageNumber', type: sql.Int, value: page },
        { name: 'PageSize', type: sql.Int, value: size },
      ]);
      return toPage(result.rows, page, size);
    },

    async create(actor: number, code: string, input: CouponInput): Promise<number> {
      const result = await execute(
        'dbo.SP_Coupons_Create',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'Code', type: sql.NVarChar(30), value: code },
          ...fields(input),
        ],
        [{ name: 'IDCoupon', type: sql.Int }],
      );
      return result.output['IDCoupon'] as number;
    },

    async update(actor: number, id: number, input: CouponInput): Promise<void> {
      await execute('dbo.SP_Coupons_Update', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDCoupon', type: sql.Int, value: id },
        ...fields(input),
      ]);
    },

    async deactivate(actor: number, id: number): Promise<void> {
      await execute('dbo.SP_Coupons_Deactivate', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDCoupon', type: sql.Int, value: id },
      ]);
    },
  };
}
