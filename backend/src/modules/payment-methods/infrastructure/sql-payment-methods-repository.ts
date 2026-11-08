import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow } from '../../../platform/http/serialise.js';
import type { Row } from '../../../platform/http/serialise.js';
import type {
  PaymentMethodInput,
  PaymentMethodsRepository,
} from '../application/payment-methods-repository.js';

/** Adaptador SQL de los métodos de pago: solo llama a SP_PaymentMethods_*, con parámetros tipados. */
const fields = (input: PaymentMethodInput) => [
  { name: 'Title', type: sql.NVarChar(80), value: input.title },
  { name: 'Description', type: sql.NVarChar(300), value: input.description },
  { name: 'AppliesToDelivery', type: sql.Bit, value: input.appliesToDelivery },
  { name: 'AppliesToPickup', type: sql.Bit, value: input.appliesToPickup },
];

const actorAndMethod = (actor: number, id: number) => [
  { name: 'IDActor', type: sql.Int, value: actor },
  { name: 'IDPaymentMethod', type: sql.TinyInt, value: id },
];

export function createSqlPaymentMethodsRepository(
  execute: ProcedureExecutor,
): PaymentMethodsRepository {
  return {
    async list(): Promise<Row[]> {
      const result = await execute<Row>('dbo.SP_PaymentMethods_List', [
        { name: 'IncludeInactive', type: sql.Bit, value: true },
        { name: 'ManagedOnly', type: sql.Bit, value: true },
      ]);
      return result.rows.map((row) => camelRow(row));
    },

    async create(actor, kind, input): Promise<number> {
      const result = await execute(
        'dbo.SP_PaymentMethods_Create',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'Kind', type: sql.NVarChar(10), value: kind },
          ...fields(input),
        ],
        [{ name: 'IDPaymentMethod', type: sql.TinyInt }],
      );
      return result.output['IDPaymentMethod'] as number;
    },

    async update(actor, id, input, isActive): Promise<void> {
      await execute('dbo.SP_PaymentMethods_Update', [
        ...actorAndMethod(actor, id),
        ...fields(input),
        { name: 'IsActive', type: sql.Bit, value: isActive },
      ]);
    },

    async deactivate(actor, id): Promise<void> {
      await execute('dbo.SP_PaymentMethods_Deactivate', actorAndMethod(actor, id));
    },
  };
}
