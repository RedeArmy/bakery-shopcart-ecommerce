import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow, toPage } from '../../../platform/http/serialise.js';
import type { Page, Row } from '../../../platform/http/serialise.js';
import type { AddressInput, UserSearch, UsersRepository } from '../application/users-repository.js';

/** Adaptador SQL de direcciones y cuentas. La pertenencia de una dirección se comprueba dentro del procedimiento. */
export function createSqlUsersRepository(execute: ProcedureExecutor): UsersRepository {
  return {
    async listAddresses(idUser: number, includeInactive: boolean): Promise<Row[]> {
      const result = await execute<Row>('dbo.SP_Addresses_List', [
        { name: 'IDUser', type: sql.Int, value: idUser },
        { name: 'IncludeInactive', type: sql.Bit, value: includeInactive },
      ]);
      return result.rows.map((row) => camelRow(row));
    },

    /** Sin idAddress crea; con él edita, y solo si la dirección es de la persona (otra responde 404). */
    async saveAddress(
      idUser: number,
      idAddress: number | null,
      input: AddressInput,
    ): Promise<number> {
      const result = await execute(
        'dbo.SP_Addresses_Save',
        [
          { name: 'IDUser', type: sql.Int, value: idUser },
          { name: 'IDAddress', type: sql.Int, value: idAddress },
          { name: 'Label', type: sql.NVarChar(40), value: input.label },
          { name: 'Recipient', type: sql.NVarChar(120), value: input.recipient },
          { name: 'Phone', type: sql.NVarChar(20), value: input.phone },
          { name: 'Line1', type: sql.NVarChar(200), value: input.line1 },
          { name: 'Line2', type: sql.NVarChar(200), value: input.line2 },
          { name: 'Municipality', type: sql.NVarChar(80), value: input.municipality },
          { name: 'Department', type: sql.NVarChar(80), value: input.department },
          { name: 'Reference', type: sql.NVarChar(200), value: input.reference },
          { name: 'IsActive', type: sql.Bit, value: input.isActive },
        ],
        [{ name: 'IDSavedAddress', type: sql.Int }],
      );
      return result.output['IDSavedAddress'] as number;
    },

    async listUsers(search: UserSearch): Promise<Page<Row>> {
      const result = await execute<Row>('dbo.SP_Users_List', [
        { name: 'Search', type: sql.NVarChar(100), value: search.search },
        { name: 'IDRole', type: sql.TinyInt, value: search.roleId },
        { name: 'IsActive', type: sql.Bit, value: search.isActive },
        { name: 'PageNumber', type: sql.Int, value: search.page },
        { name: 'PageSize', type: sql.Int, value: search.size },
      ]);
      return toPage(result.rows, search.page, search.size);
    },

    async setUserStatus(actor: number, idUser: number, isActive: boolean): Promise<void> {
      await execute('dbo.SP_Users_SetStatus', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDUser', type: sql.Int, value: idUser },
        { name: 'IsActive', type: sql.Bit, value: isActive },
      ]);
    },
  };
}
