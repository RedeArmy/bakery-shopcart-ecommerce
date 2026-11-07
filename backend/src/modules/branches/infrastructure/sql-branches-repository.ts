import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow } from '../../../platform/http/serialise.js';
import type { Row } from '../../../platform/http/serialise.js';
import type { BranchInput, BranchesRepository } from '../application/branches-repository.js';

/** Adaptador SQL de las sucursales: solo llama a SP_Branches_*, con parámetros tipados. */
const fields = (input: BranchInput) => [
  { name: 'Name', type: sql.NVarChar(80), value: input.name },
  { name: 'Line1', type: sql.NVarChar(200), value: input.line1 },
  { name: 'Municipality', type: sql.NVarChar(80), value: input.municipality },
  { name: 'Department', type: sql.NVarChar(80), value: input.department },
  { name: 'Phone', type: sql.NVarChar(20), value: input.phone },
  { name: 'OpeningHours', type: sql.NVarChar(200), value: input.openingHours },
];

export function createSqlBranchesRepository(execute: ProcedureExecutor): BranchesRepository {
  return {
    async list(includeInactive: boolean): Promise<Row[]> {
      const result = await execute<Row>('dbo.SP_Branches_List', [
        { name: 'IncludeInactive', type: sql.Bit, value: includeInactive },
      ]);
      return result.rows.map((row) => camelRow(row));
    },

    async create(actor: number, input: BranchInput): Promise<number> {
      const result = await execute(
        'dbo.SP_Branches_Create',
        [{ name: 'IDActor', type: sql.Int, value: actor }, ...fields(input)],
        [{ name: 'IDBranch', type: sql.Int }],
      );
      return result.output['IDBranch'] as number;
    },

    async update(actor: number, id: number, input: BranchInput): Promise<void> {
      await execute('dbo.SP_Branches_Update', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDBranch', type: sql.Int, value: id },
        ...fields(input),
      ]);
    },

    async deactivate(actor: number, id: number): Promise<void> {
      await execute('dbo.SP_Branches_Deactivate', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDBranch', type: sql.Int, value: id },
      ]);
    },
  };
}
