import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow } from '../../../platform/http/serialise.js';
import type { Row } from '../../../platform/http/serialise.js';
import type { CartIdentity, CartRepository } from '../application/cart-repository.js';

const identityParams = (identity: CartIdentity) => [
  { name: 'IDUser', type: sql.Int, value: 'userId' in identity ? identity.userId : null },
  {
    name: 'GuestToken',
    type: sql.UniqueIdentifier,
    value: 'guestToken' in identity ? identity.guestToken : null,
  },
];

/** Adaptador SQL del carrito: los totales y el descuento los calcula la base de datos, nunca el backend. */
export function createSqlCartRepository(execute: ProcedureExecutor): CartRepository {
  return {
    async get(identity: CartIdentity): Promise<Row> {
      const result = await execute<Row>('dbo.SP_Cart_Get', identityParams(identity));
      const row = result.rows[0];
      if (row === undefined) throw new TypeError('SP_Cart_Get returned no row');
      return camelRow(row, ['Lines']);
    },

    async setItem(
      identity: CartIdentity,
      idVariant: number,
      quantity: number,
      inscription: string | null,
    ): Promise<void> {
      await execute(
        'dbo.SP_Cart_SetItemQuantity',
        [
          ...identityParams(identity),
          { name: 'IDVariant', type: sql.Int, value: idVariant },
          { name: 'Quantity', type: sql.Int, value: quantity },
          { name: 'Inscription', type: sql.NVarChar(60), value: inscription },
        ],
        [{ name: 'IDCart', type: sql.Int }],
      );
    },

    async removeItem(identity: CartIdentity, idVariant: number): Promise<void> {
      await execute('dbo.SP_Cart_RemoveItem', [
        ...identityParams(identity),
        { name: 'IDVariant', type: sql.Int, value: idVariant },
      ]);
    },

    async applyCoupon(idUser: number, code: string): Promise<void> {
      await execute('dbo.SP_Cart_ApplyCoupon', [
        { name: 'IDUser', type: sql.Int, value: idUser },
        { name: 'Code', type: sql.NVarChar(30), value: code },
      ]);
    },

    async removeCoupon(idUser: number): Promise<void> {
      await execute('dbo.SP_Cart_RemoveCoupon', [{ name: 'IDUser', type: sql.Int, value: idUser }]);
    },

    async mergeGuest(idUser: number, guestToken: string): Promise<void> {
      await execute(
        'dbo.SP_Cart_MergeGuest',
        [
          { name: 'IDUser', type: sql.Int, value: idUser },
          { name: 'GuestToken', type: sql.UniqueIdentifier, value: guestToken },
        ],
        [{ name: 'IDCart', type: sql.Int }],
      );
    },
  };
}
