import { describe, expect, it } from 'vitest';
import { createSqlAuditRepository } from '../../src/modules/audit/infrastructure/sql-audit-repository.js';
import { createSqlCartRepository } from '../../src/modules/cart/infrastructure/sql-cart-repository.js';
import { createSqlCatalogueRepository } from '../../src/modules/catalogue/infrastructure/sql-catalogue-repository.js';
import { createSqlCheckoutRepository } from '../../src/modules/checkout/infrastructure/sql-checkout-repository.js';
import { createSqlCouponsRepository } from '../../src/modules/coupons/infrastructure/sql-coupons-repository.js';
import { createSqlInventoryRepository } from '../../src/modules/inventory/infrastructure/sql-inventory-repository.js';
import { createSqlOrdersRepository } from '../../src/modules/orders/infrastructure/sql-orders-repository.js';
import { createSqlPaymentsRepository } from '../../src/modules/payments/infrastructure/sql-payments-repository.js';
import { createSqlUsersRepository } from '../../src/modules/users/infrastructure/sql-users-repository.js';
import { createSqlIdempotencyStore } from '../../src/platform/db/idempotency-store.js';
import type { ProcedureExecutor } from '../../src/platform/db/execute-procedure.js';

interface Recorded {
  procedure: string;
  inputs: string[];
  outputs: string[];
}

/**
 * Ejecutor falso: anota el procedimiento y los nombres de sus parámetros y responde lo mínimo que los adaptadores leen.
 * Así se comprueba, sin base de datos, que cada método llama al procedimiento correcto con los nombres correctos; la
 * prueba de integración confirma después que esos nombres existen de verdad en SQL Server.
 */
function recorder(): { execute: ProcedureExecutor; last: () => Recorded } {
  let recorded: Recorded = { procedure: '', inputs: [], outputs: [] };
  const anyRow = new Proxy(
    {},
    {
      get: (_target, property: string) =>
        property.endsWith('At') ? new Date(0) : property === 'Outcome' ? 'New' : 'x',
    },
  );
  const execute = ((
    procedure: string,
    params: { name: string }[] = [],
    outputs: { name: string }[] = [],
  ) => {
    recorded = {
      procedure,
      inputs: params.map((p) => p.name),
      outputs: outputs.map((o) => o.name),
    };
    const output = new Proxy(
      {},
      { get: (_t, property: string) => (property.endsWith('At') ? new Date(0) : 5) },
    );
    return Promise.resolve({ rows: [anyRow], output });
  }) as unknown as ProcedureExecutor;
  return { execute, last: () => recorded };
}

type Case = [
  label: string,
  call: (execute: ProcedureExecutor) => Promise<unknown>,
  procedure: string,
  inputs: string[],
  outputs?: string[],
];

const date = new Date('2030-06-01T00:00:00Z');
const coupon = {
  type: 'Percentage' as const,
  value: '10.00',
  minimumAmount: '0.00',
  startsAt: date,
  endsAt: date,
  totalUsageLimit: null,
  perCustomerUsageLimit: null,
  categoryId: null,
};
const address = {
  label: 'a',
  recipient: 'a',
  phone: '1',
  line1: 'a',
  line2: null,
  municipality: 'a',
  department: 'a',
  reference: null,
  isActive: true,
};
const product = { categoryId: 1, name: 'a', description: null, leadTimeDays: 0 };
const guest = { guestToken: 'x' };

const cases: Case[] = [
  // Catálogo
  [
    'listCategories',
    (e) => createSqlCatalogueRepository(e).listCategories(false),
    'dbo.SP_Categories_List',
    ['IncludeInactive'],
  ],
  [
    'createCategory',
    (e) =>
      createSqlCatalogueRepository(e).createCategory(1, {
        name: 'a',
        description: null,
        parentId: null,
      }),
    'dbo.SP_Categories_Create',
    ['IDActor', 'Name', 'Description', 'IDParentCategory'],
    ['IDCategory'],
  ],
  [
    'updateCategory',
    (e) =>
      createSqlCatalogueRepository(e).updateCategory(1, 2, {
        name: 'a',
        description: null,
        parentId: null,
      }),
    'dbo.SP_Categories_Update',
    ['IDActor', 'IDCategory', 'Name', 'Description', 'IDParentCategory'],
  ],
  [
    'deactivateCategory',
    (e) => createSqlCatalogueRepository(e).deactivateCategory(1, 2),
    'dbo.SP_Categories_Deactivate',
    ['IDActor', 'IDCategory'],
  ],
  [
    'searchProducts',
    (e) =>
      createSqlCatalogueRepository(e).searchProducts({
        query: null,
        categoryId: null,
        minPrice: null,
        maxPrice: null,
        inStockOnly: false,
        includeInactive: false,
        sort: 'name',
        page: 1,
        size: 20,
      }),
    'dbo.SP_Products_Search',
    [
      'Query',
      'IDCategory',
      'MinPrice',
      'MaxPrice',
      'InStockOnly',
      'IncludeInactive',
      'SortBy',
      'PageNumber',
      'PageSize',
    ],
  ],
  [
    'createProduct',
    (e) => createSqlCatalogueRepository(e).createProduct(1, product),
    'dbo.SP_Products_Create',
    ['IDActor', 'IDCategory', 'Name', 'Description', 'LeadTimeDays'],
    ['IDProduct'],
  ],
  [
    'updateProduct',
    (e) => createSqlCatalogueRepository(e).updateProduct(1, 2, product, null),
    'dbo.SP_Products_Update',
    ['IDActor', 'IDProduct', 'IDCategory', 'Name', 'Description', 'LeadTimeDays', 'RowVer'],
  ],
  [
    'deactivateProduct',
    (e) => createSqlCatalogueRepository(e).deactivateProduct(1, 2),
    'dbo.SP_Products_Deactivate',
    ['IDActor', 'IDProduct'],
  ],
  [
    'createVariant',
    (e) =>
      createSqlCatalogueRepository(e).createVariant(1, 2, {
        sku: 'A',
        price: '1.00',
        attributes: [{ name: 'a', value: 'b' }],
      }),
    'dbo.SP_Variants_Create',
    ['IDActor', 'IDProduct', 'SKU', 'Price', 'Attributes'],
    ['IDVariant'],
  ],
  [
    'updateVariant',
    (e) =>
      createSqlCatalogueRepository(e).updateVariant(1, 2, {
        sku: 'A',
        isActive: true,
        attributes: null,
      }),
    'dbo.SP_Variants_Update',
    ['IDActor', 'IDVariant', 'SKU', 'IsActive', 'Attributes'],
  ],
  [
    'changePrice',
    (e) => createSqlCatalogueRepository(e).changePrice(1, 2, '1.00'),
    'dbo.SP_Variants_ChangePrice',
    ['IDActor', 'IDVariant', 'NewPrice'],
  ],
  // Carrito
  [
    'cart get (guest)',
    (e) => createSqlCartRepository(e).get(guest),
    'dbo.SP_Cart_Get',
    ['IDUser', 'GuestToken'],
  ],
  [
    'cart setItem',
    (e) => createSqlCartRepository(e).setItem({ userId: 1 }, 2, 3, null),
    'dbo.SP_Cart_SetItemQuantity',
    ['IDUser', 'GuestToken', 'IDVariant', 'Quantity', 'Inscription'],
    ['IDCart'],
  ],
  [
    'cart removeItem',
    (e) => createSqlCartRepository(e).removeItem(guest, 2),
    'dbo.SP_Cart_RemoveItem',
    ['IDUser', 'GuestToken', 'IDVariant'],
  ],
  [
    'applyCoupon',
    (e) => createSqlCartRepository(e).applyCoupon(1, 'X'),
    'dbo.SP_Cart_ApplyCoupon',
    ['IDUser', 'Code'],
  ],
  [
    'removeCoupon',
    (e) => createSqlCartRepository(e).removeCoupon(1),
    'dbo.SP_Cart_RemoveCoupon',
    ['IDUser'],
  ],
  [
    'mergeGuest',
    (e) => createSqlCartRepository(e).mergeGuest(1, 'x'),
    'dbo.SP_Cart_MergeGuest',
    ['IDUser', 'GuestToken'],
    ['IDCart'],
  ],
  // Direcciones y cuentas
  [
    'listAddresses',
    (e) => createSqlUsersRepository(e).listAddresses(1, false),
    'dbo.SP_Addresses_List',
    ['IDUser', 'IncludeInactive'],
  ],
  [
    'saveAddress',
    (e) => createSqlUsersRepository(e).saveAddress(1, null, address),
    'dbo.SP_Addresses_Save',
    [
      'IDUser',
      'IDAddress',
      'Label',
      'Recipient',
      'Phone',
      'Line1',
      'Line2',
      'Municipality',
      'Department',
      'Reference',
      'IsActive',
    ],
    ['IDSavedAddress'],
  ],
  [
    'listUsers',
    (e) =>
      createSqlUsersRepository(e).listUsers({
        search: null,
        roleId: null,
        isActive: null,
        page: 1,
        size: 20,
      }),
    'dbo.SP_Users_List',
    ['Search', 'IDRole', 'IsActive', 'PageNumber', 'PageSize'],
  ],
  [
    'setUserStatus',
    (e) => createSqlUsersRepository(e).setUserStatus(1, 2, true),
    'dbo.SP_Users_SetStatus',
    ['IDActor', 'IDUser', 'IsActive'],
  ],
  // Cupones
  [
    'coupons list',
    (e) => createSqlCouponsRepository(e).list(false, 1, 20),
    'dbo.SP_Coupons_List',
    ['IncludeInactive', 'PageNumber', 'PageSize'],
  ],
  [
    'coupons create',
    (e) => createSqlCouponsRepository(e).create(1, 'X', coupon),
    'dbo.SP_Coupons_Create',
    [
      'IDActor',
      'Code',
      'Type',
      'Value',
      'MinimumAmount',
      'StartsAt',
      'EndsAt',
      'TotalUsageLimit',
      'PerCustomerUsageLimit',
      'IDCategory',
    ],
    ['IDCoupon'],
  ],
  [
    'coupons update',
    (e) => createSqlCouponsRepository(e).update(1, 2, coupon),
    'dbo.SP_Coupons_Update',
    [
      'IDActor',
      'IDCoupon',
      'Type',
      'Value',
      'MinimumAmount',
      'StartsAt',
      'EndsAt',
      'TotalUsageLimit',
      'PerCustomerUsageLimit',
      'IDCategory',
    ],
  ],
  [
    'coupons deactivate',
    (e) => createSqlCouponsRepository(e).deactivate(1, 2),
    'dbo.SP_Coupons_Deactivate',
    ['IDActor', 'IDCoupon'],
  ],
  // Inventario
  [
    'ledger',
    (e) => createSqlInventoryRepository(e).ledger(1, { from: null, to: null }, 1, 20),
    'dbo.SP_Inventory_GetLedger',
    ['IDVariant', 'From', 'To', 'PageNumber', 'PageSize'],
  ],
  [
    'registerEntry',
    (e) => createSqlInventoryRepository(e).registerEntry(1, 2, 3, 'r'),
    'dbo.SP_Inventory_RegisterEntry',
    ['IDActor', 'IDVariant', 'Quantity', 'Reason'],
    ['IDMovement'],
  ],
  [
    'adjust',
    (e) => createSqlInventoryRepository(e).adjust(1, 2, 3, 'r'),
    'dbo.SP_Inventory_AdjustStock',
    ['IDActor', 'IDVariant', 'NewOnHand', 'Reason'],
    ['IDMovement'],
  ],
  // Auditoría
  [
    'audit query',
    (e) =>
      createSqlAuditRepository(e).query({
        module: null,
        entityKey: null,
        from: null,
        to: null,
        page: 1,
        size: 20,
      }),
    'dbo.SP_Audit_Query',
    ['Module', 'EntityKey', 'From', 'To', 'PageNumber', 'PageSize'],
  ],
  [
    'reconciliation',
    (e) => createSqlAuditRepository(e).reconciliation(100),
    'dbo.SP_Reconciliation_List',
    ['Limit'],
  ],
  // Pedidos
  [
    'orders list',
    (e) =>
      createSqlOrdersRepository(e).list({
        actor: 1,
        asStaff: false,
        statusId: null,
        search: null,
        from: null,
        to: null,
        page: 1,
        size: 20,
      }),
    'dbo.SP_Orders_List',
    ['IDActor', 'AsStaff', 'IDOrderStatus', 'Search', 'From', 'To', 'PageNumber', 'PageSize'],
  ],
  [
    'orders detail',
    (e) => createSqlOrdersRepository(e).detail(1, false, 2),
    'dbo.SP_Orders_GetDetail',
    ['IDActor', 'AsStaff', 'IDOrder'],
  ],
  [
    'orders cancel',
    (e) => createSqlOrdersRepository(e).cancel(1, 2, 'r'),
    'dbo.SP_Orders_Cancel',
    ['IDActor', 'IDOrder', 'Reason'],
  ],
  [
    'orders changeStatus',
    (e) => createSqlOrdersRepository(e).changeStatus(1, 2, 3, null),
    'dbo.SP_Orders_ChangeStatus',
    ['IDActor', 'IDOrder', 'NewStatus', 'Comment'],
  ],
  [
    'registerReturn',
    (e) =>
      createSqlOrdersRepository(e).registerReturn(1, 2, 'r', [{ idOrderLine: 3, quantity: 1 }]),
    'dbo.SP_Returns_Register',
    ['IDActor', 'IDOrder', 'Reason', 'Lines'],
    ['IDReturn', 'IDRefund', 'RefundAmountText'],
  ],
  // Pagos
  [
    'paymentsOfOrder',
    (e) => createSqlPaymentsRepository(e).paymentsOfOrder(1, false, 2),
    'dbo.SP_Payments_GetByOrder',
    ['IDActor', 'AsStaff', 'IDOrder'],
  ],
  [
    'registerProof',
    (e) =>
      createSqlPaymentsRepository(e).registerProof({
        userId: 1,
        idPayment: 2,
        originalFileName: 'a',
        storageKey: 'k',
        mimeType: 'image/png',
        sizeBytes: 1,
        sha256: 'h',
        referenceNumber: 'r',
        depositDate: '2030-06-01',
        depositedAmount: '1.00',
      }),
    'dbo.SP_Payments_RegisterProof',
    [
      'IDUser',
      'IDPayment',
      'OriginalFileName',
      'StorageKey',
      'MimeType',
      'SizeBytes',
      'Sha256Hash',
      'ReferenceNumber',
      'DepositDate',
      'DepositedAmount',
    ],
    ['IDPaymentProof'],
  ],
  [
    'getProof',
    (e) => createSqlPaymentsRepository(e).getProof(1, false, 2, 3),
    'dbo.SP_Payments_GetProof',
    ['IDActor', 'AsStaff', 'IDPayment', 'IDPaymentProof'],
  ],
  [
    'createAttempt',
    (e) => createSqlPaymentsRepository(e).createAttempt(1, 2, 'k', null),
    'dbo.SP_Payments_CreateDepositAttempt',
    ['IDUser', 'IDOrder', 'IdempotencyKey', 'IDBankAccount'],
    ['IDPayment', 'ExpiresAt'],
  ],
  [
    'listDeposits',
    (e) =>
      createSqlPaymentsRepository(e).listDeposits({
        statusId: 2,
        from: null,
        to: null,
        page: 1,
        size: 20,
      }),
    'dbo.SP_Payments_ListPendingDeposits',
    ['IDPaymentStatus', 'From', 'To', 'PageNumber', 'PageSize'],
  ],
  [
    'approve',
    (e) => createSqlPaymentsRepository(e).approve(1, 2),
    'dbo.SP_Payments_ApproveDeposit',
    ['IDActor', 'IDPayment'],
    ['Outcome'],
  ],
  [
    'reject',
    (e) => createSqlPaymentsRepository(e).reject(1, 2, 'r'),
    'dbo.SP_Payments_RejectDeposit',
    ['IDActor', 'IDPayment', 'Reason'],
    ['Outcome'],
  ],
  [
    'listBankAccounts',
    (e) => createSqlPaymentsRepository(e).listBankAccounts(true),
    'dbo.SP_BankAccounts_List',
    ['IncludeInactive'],
  ],
  [
    'saveBankAccount',
    (e) =>
      createSqlPaymentsRepository(e).saveBankAccount(1, null, {
        bankName: 'b',
        accountType: 'Savings',
        accountNumber: '1',
        holderName: 'h',
        instructions: null,
        isActive: true,
      }),
    'dbo.SP_BankAccounts_Save',
    [
      'IDActor',
      'IDBankAccount',
      'BankName',
      'AccountType',
      'AccountNumber',
      'HolderName',
      'Instructions',
      'IsActive',
    ],
    ['IDSaved'],
  ],
  [
    'listRefunds',
    (e) => createSqlPaymentsRepository(e).listRefunds(null, 100),
    'dbo.SP_Refunds_List',
    ['Status', 'Limit'],
  ],
  [
    'markRefund',
    (e) => createSqlPaymentsRepository(e).markRefund(1, 2, 'Processed', 't'),
    'dbo.SP_Refunds_Mark',
    ['IDActor', 'IDRefund', 'Status', 'ExternalReference'],
  ],
  // Checkout
  [
    'cartSummary',
    (e) => createSqlCheckoutRepository(e).cartSummary(1),
    'dbo.SP_Cart_Get',
    ['IDUser', 'GuestToken'],
  ],
  [
    'reserve',
    (e) => createSqlCheckoutRepository(e).reserve(1, 2),
    'dbo.SP_Inventory_ReserveStock',
    ['IDUser', 'IDCart'],
    ['IDReservation', 'ExpiresAt'],
  ],
  [
    'depositWindow',
    (e) => createSqlCheckoutRepository(e).depositWindow(1, '2030-06-20'),
    'dbo.SP_Payments_GetMethodsAndWindow',
    ['IDUser', 'DeliveryDate'],
  ],
  [
    'bankAccounts',
    (e) => createSqlCheckoutRepository(e).bankAccounts(),
    'dbo.SP_BankAccounts_List',
    [],
  ],
  [
    'createOrder',
    (e) =>
      createSqlCheckoutRepository(e).createOrder({
        userId: 1,
        idReservation: 2,
        idAddress: 3,
        deliveryDate: '2030-06-20',
        idPaymentMethod: 2,
        storedKey: 'k',
        idBankAccount: 1,
      }),
    'dbo.SP_Orders_CreateOrder',
    [
      'IDUser',
      'IDReservation',
      'IDAddress',
      'RequestedDeliveryDate',
      'IDPaymentMethod',
      'IdempotencyKey',
      'IDBankAccount',
    ],
    ['IDOrder', 'IDPayment', 'OrderNumber', 'PaymentExpiresAt'],
  ],
  // Idempotencia
  [
    'idempotency begin',
    (e) =>
      createSqlIdempotencyStore(e).begin({
        scope: 'U:1',
        method: 'POST',
        route: '/x',
        key: 'k',
        requestHash: 'h',
      }),
    'dbo.SP_Idempotency_Begin',
    ['Scope', 'Method', 'Route', 'IdempotencyKey', 'RequestHash'],
  ],
  [
    'idempotency complete',
    (e) =>
      createSqlIdempotencyStore(e).complete({
        scope: 'U:1',
        method: 'POST',
        route: '/x',
        key: 'k',
        httpStatus: 201,
        body: '{}',
      }),
    'dbo.SP_Idempotency_Complete',
    ['Scope', 'Method', 'Route', 'IdempotencyKey', 'HttpStatus', 'ResponseBody'],
    ['Stored'],
  ],
  [
    'idempotency fail',
    (e) =>
      createSqlIdempotencyStore(e).fail({ scope: 'U:1', method: 'POST', route: '/x', key: 'k' }),
    'dbo.SP_Idempotency_Fail',
    ['Scope', 'Method', 'Route', 'IdempotencyKey'],
  ],
];

describe('SQL adapters call the right procedure with the right parameter names', () => {
  it.each(cases)('%s', async (_label, call, procedure, inputs, outputs = []) => {
    const { execute, last } = recorder();
    await call(execute);
    expect(last()).toEqual({ procedure, inputs, outputs });
  });

  it('reads the system version from two procedures', async () => {
    const { execute } = recorder();
    const version = await createSqlAuditRepository(execute).systemVersion();
    expect(version.objects).toHaveLength(1);
  });

  it('turns a nullable movement output into null when the stock already had the value', async () => {
    const execute = (() =>
      Promise.resolve({ rows: [], output: { IDMovement: null } })) as unknown as ProcedureExecutor;
    expect(await createSqlInventoryRepository(execute).adjust(1, 2, 3, 'r')).toBeNull();
  });
});
