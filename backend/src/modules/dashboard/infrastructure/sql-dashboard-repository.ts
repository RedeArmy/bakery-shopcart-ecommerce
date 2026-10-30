import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow, toPage } from '../../../platform/http/serialise.js';
import type { Row } from '../../../platform/http/serialise.js';
import type { DashboardRepository, DateRange } from '../application/dashboard-repository.js';

/** Las fechas llegan como yyyy-mm-dd; a medianoche UTC para que el controlador no las desplace de día. */
const asDate = (value: string | null): Date | null =>
  value === null ? null : new Date(`${value}T00:00:00.000Z`);

const rangeParams = (range: DateRange) => [
  { name: 'From', type: sql.Date, value: asDate(range.from) },
  { name: 'To', type: sql.Date, value: asDate(range.to) },
];

/** Adaptador SQL del panel: solo llama a SP_Dashboard_*; la base de datos agrega, redondea y descuenta. */
export function createSqlDashboardRepository(execute: ProcedureExecutor): DashboardRepository {
  return {
    async summary(range) {
      const result = await execute<Row>('dbo.SP_Dashboard_Summary', rangeParams(range));
      const row = result.rows[0];
      if (row === undefined) throw new TypeError('SP_Dashboard_Summary returned no row');
      return camelRow(row);
    },

    async salesByPeriod(range, granularity) {
      const result = await execute<Row>('dbo.SP_Dashboard_SalesByPeriod', [
        ...rangeParams(range),
        { name: 'Granularity', type: sql.VarChar(5), value: granularity },
      ]);
      return result.rows.map((row) => camelRow(row));
    },

    async salesByCategory(range) {
      const result = await execute<Row>('dbo.SP_Dashboard_SalesByCategory', rangeParams(range));
      return result.rows.map((row) => camelRow(row));
    },

    async topProducts(range, top) {
      const result = await execute<Row>('dbo.SP_Dashboard_TopProducts', [
        ...rangeParams(range),
        { name: 'Top', type: sql.Int, value: top },
      ]);
      return result.rows.map((row) => camelRow(row));
    },

    async abandonedCarts(page, size) {
      const result = await execute<Row>('dbo.SP_Dashboard_AbandonedCarts', [
        { name: 'PageNumber', type: sql.Int, value: page },
        { name: 'PageSize', type: sql.Int, value: size },
      ]);
      return toPage(result.rows, page, size);
    },
  };
}
