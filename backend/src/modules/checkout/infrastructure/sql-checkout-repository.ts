import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow } from '../../../platform/http/serialise.js';
import type { Row } from '../../../platform/http/serialise.js';
import type {
  BankAccount,
  CartSummary,
  CheckoutRepositoryPort,
  CreatedOrder,
  DepositWindow,
} from '../application/checkout-service.js';

/** La fecha llega como yyyy-mm-dd; a medianoche UTC para que el controlador de SQL Server no la desplace de día. */
const asDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** Adaptador SQL del checkout: reserva, ventana de depósito y creación del pedido, todo por procedimientos. */
export function createSqlCheckoutRepository(execute: ProcedureExecutor): CheckoutRepositoryPort {
  return {
    async cartSummary(userId): Promise<CartSummary> {
      const result = await execute<Row>('dbo.SP_Cart_Get', [
        { name: 'IDUser', type: sql.Int, value: userId },
        { name: 'GuestToken', type: sql.UniqueIdentifier, value: null },
      ]);
      const cart = camelRow(result.rows[0] ?? {});
      return {
        idCart: (cart['idCart'] as number | null | undefined) ?? null,
        itemCount: Number(cart['itemCount'] ?? 0),
        hasUnavailableLines: cart['hasUnavailableLines'] === true,
      };
    },

    async reserve(userId, idCart) {
      const result = await execute(
        'dbo.SP_Inventory_ReserveStock',
        [
          { name: 'IDUser', type: sql.Int, value: userId },
          { name: 'IDCart', type: sql.Int, value: idCart },
        ],
        [
          { name: 'IDReservation', type: sql.Int },
          { name: 'ExpiresAt', type: sql.DateTime2(3) },
        ],
      );
      return {
        idReservation: result.output['IDReservation'] as number,
        expiresAt: (result.output['ExpiresAt'] as Date).toISOString(),
      };
    },

    async depositWindow(userId, deliveryDate): Promise<DepositWindow> {
      const result = await execute<Row>('dbo.SP_Payments_GetMethodsAndWindow', [
        { name: 'IDUser', type: sql.Int, value: userId },
        { name: 'DeliveryDate', type: sql.Date, value: asDate(deliveryDate) },
      ]);
      const row = result.rows[0];
      if (row === undefined) throw new TypeError('SP_Payments_GetMethodsAndWindow returned no row');
      return camelRow(row) as unknown as DepositWindow;
    },

    async bankAccounts(): Promise<BankAccount[]> {
      const result = await execute<Row>('dbo.SP_BankAccounts_List');
      return result.rows.map((row) => camelRow(row) as unknown as BankAccount);
    },

    async createOrder(input): Promise<CreatedOrder> {
      const result = await execute(
        'dbo.SP_Orders_CreateOrder',
        [
          { name: 'IDUser', type: sql.Int, value: input.userId },
          { name: 'IDReservation', type: sql.Int, value: input.idReservation },
          { name: 'IDAddress', type: sql.Int, value: input.idAddress },
          { name: 'RequestedDeliveryDate', type: sql.Date, value: asDate(input.deliveryDate) },
          { name: 'IDPaymentMethod', type: sql.TinyInt, value: input.idPaymentMethod },
          { name: 'IdempotencyKey', type: sql.NVarChar(64), value: input.storedKey },
          { name: 'IDBankAccount', type: sql.Int, value: input.idBankAccount },
        ],
        [
          { name: 'IDOrder', type: sql.Int },
          { name: 'IDPayment', type: sql.Int },
          { name: 'OrderNumber', type: sql.NVarChar(20) },
          { name: 'PaymentExpiresAt', type: sql.DateTime2(3) },
        ],
      );
      return {
        idOrder: result.output['IDOrder'] as number,
        idPayment: result.output['IDPayment'] as number,
        orderNumber: result.output['OrderNumber'] as string,
        paymentExpiresAt: (result.output['PaymentExpiresAt'] as Date).toISOString(),
      };
    },
  };
}
