import { Readable } from 'node:stream';
import express from 'express';
import type { RequestHandler, Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuditRouter } from '../../src/modules/audit/index.js';
import { createCartRouter } from '../../src/modules/cart/index.js';
import { buildCategoryTree, createCatalogueRouter } from '../../src/modules/catalogue/index.js';
import {
  CheckoutService,
  createCheckoutRouter,
  storedKeyOf,
} from '../../src/modules/checkout/index.js';
import type { CheckoutRepositoryPort } from '../../src/modules/checkout/index.js';
import { createCouponsRouter } from '../../src/modules/coupons/index.js';
import { createInventoryRouter } from '../../src/modules/inventory/index.js';
import { createOrdersRouter } from '../../src/modules/orders/index.js';
import {
  PaymentsService,
  createPaymentsRouter,
  safeFileName,
} from '../../src/modules/payments/index.js';
import { createUsersRouter } from '../../src/modules/users/index.js';
import { requireRole } from '../../src/platform/http/authentication.js';
import { createErrorHandler } from '../../src/platform/http/error-handler.js';
import type { RouteKit } from '../../src/platform/http/route-kit.js';
import { camelKey, camelRow, toPage } from '../../src/platform/http/serialise.js';
import { createLogger } from '../../src/platform/logging/logger.js';
import { detectProofMime } from '../../src/platform/storage/file-signature.js';
import type { FileStoragePort } from '../../src/platform/storage/local-disk-storage.js';
import { AppError } from '../../src/shared-kernel/index.js';

const logger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });
const passThrough: RequestHandler = (_req, _res, next) => {
  next();
};

/** "5:Customer" en X-Test-User hace de token verificado; sin la cabecera no hay sesión. */
const authenticate: RequestHandler = (req, res, next) => {
  const header = req.header('X-Test-User');
  if (header === undefined)
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
  const [id, role] = header.split(':');
  res.locals['user'] = { idUser: Number(id), role };
  next();
};
const optionalAuthenticate: RequestHandler = (req, res, next) => {
  if (req.header('X-Test-User') === undefined) next();
  else authenticate(req, res, next);
};

const kit: RouteKit = {
  execute: undefined as never,
  clock: { now: () => new Date('2030-06-01T12:00:00Z') },
  authenticate,
  optionalAuthenticate,
  rateLimit: () => passThrough,
  idempotent: () => passThrough,
  role: requireRole,
  proofMaxBytes: 1024,
};

interface Call {
  method: string;
  args: unknown[];
}

/** Repositorio falso: cada método registra su llamada y devuelve lo que se le haya preparado. */
function fake(answers: Record<string, unknown> = {}): { repository: never; calls: Call[] } {
  const calls: Call[] = [];
  const repository = new Proxy(
    {},
    {
      get:
        (_target, method: string) =>
        (...args: unknown[]) => {
          calls.push({ method, args });
          return Promise.resolve(answers[method]);
        },
    },
  );
  // `never` es asignable a cualquier puerto: así el mismo falso sirve para todos los módulos
  return { repository: repository as never, calls };
}

function appWith(router: Router): express.Express {
  const app = express();
  app.use((_req, res, next) => {
    res.locals['requestId'] = 'test-request';
    next();
  });
  app.use(express.json());
  app.use(router);
  app.use(createErrorHandler(logger));
  return app;
}

const as = (user: string) => ({ 'X-Test-User': user });
const codeOf = (response: { body: unknown }): string =>
  (response.body as { error: { code: string } }).error.code;

describe('serialisation helpers', () => {
  it.each([
    ['IDOrder', 'idOrder'],
    ['SKU', 'sku'],
    ['PrimaryImageUrl', 'primaryImageUrl'],
    ['IsActive', 'isActive'],
    ['IDUser', 'idUser'],
  ])('turns %s into %s', (from, to) => {
    expect(camelKey(from)).toBe(to);
  });

  it('keeps dates as ISO text, DATE columns as yyyy-mm-dd, binaries as base64 and parses JSON columns', () => {
    const row = camelRow(
      {
        CreatedAt: new Date('2030-06-01T12:00:00.000Z'),
        DepositDate: new Date('2030-06-20T00:00:00.000Z'),
        RowVer: Buffer.from([1, 2, 3, 4]),
        Lines: '[{"IDOrderLine":1,"SKU":"A"}]',
        TotalCount: 9,
      },
      ['Lines'],
    );
    expect(row).toEqual({
      createdAt: '2030-06-01T12:00:00.000Z',
      depositDate: '2030-06-20',
      rowVer: Buffer.from([1, 2, 3, 4]).toString('base64'),
      lines: [{ idOrderLine: 1, sku: 'A' }],
    });
  });

  it('builds a page with the total of the first row, and zero when empty', () => {
    expect(toPage([{ IDOrder: 1, TotalCount: 7 }], 2, 5)).toEqual({
      items: [{ idOrder: 1 }],
      page: 2,
      size: 5,
      total: 7,
    });
    expect(toPage([], 1, 20).total).toBe(0);
  });

  it('detects JPEG, PNG and PDF by their first bytes and refuses anything else', () => {
    expect(detectProofMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectProofMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(detectProofMime(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(detectProofMime(Buffer.from('MZ executable'))).toBeNull();
    expect(detectProofMime(Buffer.alloc(0))).toBeNull();
  });

  it('cleans a file name so it is safe in a header', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('a"b\r\n.png')).toBe('a_b__.png');
    expect(safeFileName('...')).toBe('proof');
  });
});

describe('catalogue routes', () => {
  const sample = [
    { idCategory: 1, idParentCategory: null, name: 'Cakes' },
    { idCategory: 2, idParentCategory: 1, name: 'Wedding' },
  ];

  it('builds the category tree from the flat list', () => {
    const tree = buildCategoryTree(sample);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.['name']).toBe('Wedding');
  });

  it('serves the tree and the search without a session and passes the parsed filters', async () => {
    const { repository, calls } = fake({
      listCategories: sample,
      searchProducts: { items: [], page: 1, size: 20, total: 0 },
    });
    const app = appWith(createCatalogueRouter(kit, repository));
    expect((await request(app).get('/categories')).body).toHaveLength(1);
    await request(app).get(
      '/products?q=cake&category=3&min=10.00&available=true&sort=price_desc&page=2&size=5',
    );
    expect(calls.at(-1)).toEqual({
      method: 'searchProducts',
      args: [
        {
          query: 'cake',
          categoryId: 3,
          minPrice: '10.00',
          maxPrice: null,
          inStockOnly: true,
          includeInactive: false,
          sort: 'price_desc',
          page: 2,
          size: 5,
        },
      ],
    });
  });

  it('refuses an amount sent as a number and a page size above 100', async () => {
    const { repository } = fake();
    const app = appWith(createCatalogueRouter(kit, repository));
    const price = await request(app)
      .patch('/admin/variants/4/price')
      .set(as('1:Administrator'))
      .send({ price: 12.5 });
    expect(price.status).toBe(400);
    expect((await request(app).get('/products?size=101')).status).toBe(400);
  });

  it('lets only an administrator write, with the actor taken from the token', async () => {
    const { repository, calls } = fake({
      createCategory: 9,
      updateProduct: undefined,
      changePrice: undefined,
    });
    const app = appWith(createCatalogueRouter(kit, repository));
    expect(
      (await request(app).post('/admin/categories').set(as('2:Operator')).send({ name: 'X' }))
        .status,
    ).toBe(403);
    expect((await request(app).post('/admin/categories').send({ name: 'X' })).status).toBe(401);
    const created = await request(app)
      .post('/admin/categories')
      .set(as('1:Administrator'))
      .send({ name: 'Cakes' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ idCategory: 9 });
    expect(calls.at(-1)?.args[0]).toBe(1);

    await request(app)
      .put('/admin/products/5')
      .set(as('1:Administrator'))
      .send({ categoryId: 1, name: 'P', rowVersion: 'AAAAAAAAB9E=' });
    const update = calls.at(-1);
    expect(update?.method).toBe('updateProduct');
    expect(Buffer.isBuffer(update?.args[3])).toBe(true);
    await request(app)
      .patch('/admin/variants/4/price')
      .set(as('1:Administrator'))
      .send({ price: '12.50' });
    expect(calls.at(-1)).toEqual({ method: 'changePrice', args: [1, 4, '12.50'] });
  });
});

describe('cart routes', () => {
  const token = '6f1c2a34-8e0b-4a6e-9a3a-0b1f7c9d2e11';

  it('answers an empty cart without touching the database when there is no identity', async () => {
    const { repository, calls } = fake();
    const response = await request(appWith(createCartRouter(kit, repository))).get('/cart');
    expect(response.body).toMatchObject({ idCart: null, total: '0.00', lines: [] });
    expect(calls).toHaveLength(0);
  });

  it('uses the visitor token, prefers the account when there is a session and rejects a bad token', async () => {
    const { repository, calls } = fake({ get: { idCart: 1 } });
    const app = appWith(createCartRouter(kit, repository));
    await request(app).get('/cart').set('X-Cart-Token', token);
    expect(calls.at(-1)).toEqual({ method: 'get', args: [{ guestToken: token }] });
    await request(app).get('/cart').set('X-Cart-Token', token).set(as('7:Customer'));
    expect(calls.at(-1)).toEqual({ method: 'get', args: [{ userId: 7 }] });
    const bad = await request(app).get('/cart').set('X-Cart-Token', 'not-a-uuid');
    expect(bad.status).toBe(400);
    expect(codeOf(bad)).toBe('CART_TOKEN_INVALID');
  });

  it('needs an identity to change the cart and validates the quantity', async () => {
    const { repository, calls } = fake({ get: { idCart: 1 } });
    const app = appWith(createCartRouter(kit, repository));
    const none = await request(app).put('/cart/items/3').send({ quantity: 1 });
    expect(codeOf(none)).toBe('CART_TOKEN_REQUIRED');
    expect(
      (await request(app).put('/cart/items/3').set('X-Cart-Token', token).send({ quantity: 0 }))
        .status,
    ).toBe(400);
    expect(
      (await request(app).put('/cart/items/3').set('X-Cart-Token', token).send({ quantity: 100 }))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .put('/cart/items/3')
          .set('X-Cart-Token', token)
          .send({ quantity: 2, inscription: 'Happy' })
      ).status,
    ).toBe(200);
    expect(calls.find((call) => call.method === 'setItem')?.args).toEqual([
      { guestToken: token },
      3,
      2,
      'Happy',
    ]);
    expect((await request(app).delete('/cart/items/3').set('X-Cart-Token', token)).status).toBe(
      200,
    );
  });

  it('keeps the coupon and the merge for a signed-in customer, with the id from the token', async () => {
    const { repository, calls } = fake({ get: { idCart: 1 } });
    const app = appWith(createCartRouter(kit, repository));
    expect((await request(app).post('/cart/coupon').send({ code: 'X' })).status).toBe(401);
    await request(app).post('/cart/coupon').set(as('7:Customer')).send({ code: 'WELCOME10' });
    expect(calls.find((call) => call.method === 'applyCoupon')?.args).toEqual([7, 'WELCOME10']);
    await request(app).delete('/cart/coupon').set(as('7:Customer'));
    expect(calls.some((call) => call.method === 'removeCoupon')).toBe(true);
    await request(app).post('/cart/merge').set(as('7:Customer')).send({ guestToken: token });
    expect(calls.find((call) => call.method === 'mergeGuest')?.args).toEqual([7, token]);
    expect(
      (await request(app).post('/cart/merge').set(as('7:Customer')).send({ guestToken: 'x' }))
        .status,
    ).toBe(400);
  });
});

describe('addresses and accounts', () => {
  it('lists and saves addresses of the token owner only, and filters the accounts', async () => {
    const { repository, calls } = fake({
      listAddresses: [],
      saveAddress: 4,
      listUsers: { items: [], page: 1, size: 20, total: 0 },
    });
    const app = appWith(createUsersRouter(kit, repository));
    const body = {
      label: 'Home',
      recipient: 'Ana',
      phone: '55550000',
      line1: '5th Avenue',
      municipality: 'G',
      department: 'G',
    };
    await request(app).get('/addresses').set(as('7:Customer'));
    expect(calls.at(-1)).toEqual({ method: 'listAddresses', args: [7, false] });
    expect((await request(app).post('/addresses').set(as('7:Customer')).send(body)).status).toBe(
      201,
    );
    expect(calls.at(-1)?.args.slice(0, 2)).toEqual([7, null]);
    await request(app).put('/addresses/9').set(as('7:Customer')).send(body);
    expect(calls.at(-1)?.args.slice(0, 2)).toEqual([7, 9]);
    expect(
      (
        await request(app)
          .post('/addresses')
          .set(as('7:Customer'))
          .send({ ...body, phone: 'abc' })
      ).status,
    ).toBe(400);
    expect((await request(app).get('/addresses').set(as('1:Administrator'))).status).toBe(403);

    await request(app)
      .get('/admin/users?search=ana&role=1&active=false')
      .set(as('1:Administrator'));
    expect(calls.at(-1)).toEqual({
      method: 'listUsers',
      args: [{ search: 'ana', roleId: 1, isActive: false, page: 1, size: 20 }],
    });
    await request(app).patch('/admin/users/3').set(as('1:Administrator')).send({ isActive: false });
    expect(calls.at(-1)).toEqual({ method: 'setUserStatus', args: [1, 3, false] });
    expect((await request(app).get('/admin/users').set(as('2:Operator'))).status).toBe(403);
  });
});

describe('administration routes', () => {
  it('parses coupons: the code is upper-cased and the dates become instants', async () => {
    const { repository, calls } = fake({
      create: 5,
      list: { items: [], page: 1, size: 20, total: 0 },
    });
    const app = appWith(createCouponsRouter(kit, repository));
    const body = {
      code: 'spring25',
      type: 'Percentage',
      value: '25.00',
      startsAt: '2030-01-01T00:00:00Z',
      endsAt: '2030-12-31T00:00:00Z',
    };
    expect(
      (await request(app).post('/admin/coupons').set(as('1:Administrator')).send(body)).status,
    ).toBe(201);
    const [actor, code, input] = calls.at(-1)?.args as [
      number,
      string,
      { startsAt: Date; minimumAmount: string },
    ];
    expect([actor, code, input.minimumAmount]).toEqual([1, 'SPRING25', '0.00']);
    expect(input.startsAt).toBeInstanceOf(Date);
    expect(
      (
        await request(app)
          .post('/admin/coupons')
          .set(as('1:Administrator'))
          .send({ ...body, value: 25 })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).get('/admin/coupons?includeInactive=true').set(as('1:Administrator')))
        .status,
    ).toBe(200);
    expect((await request(app).get('/admin/coupons').set(as('2:Operator'))).status).toBe(403);
  });

  it('lets an operator read the ledger but only an administrator move stock', async () => {
    const { repository, calls } = fake({
      ledger: { items: [], page: 1, size: 20, total: 0 },
      registerEntry: '10',
      adjust: null,
    });
    const app = appWith(createInventoryRouter(kit, repository));
    expect(
      (await request(app).get('/admin/inventory/ledger?variant=4').set(as('2:Operator'))).status,
    ).toBe(200);
    expect((await request(app).get('/admin/inventory/ledger').set(as('2:Operator'))).status).toBe(
      400,
    );
    expect(
      (
        await request(app)
          .post('/admin/inventory/entries')
          .set(as('2:Operator'))
          .send({ idVariant: 4, quantity: 5, reason: 'x' })
      ).status,
    ).toBe(403);
    const entry = await request(app)
      .post('/admin/inventory/entries')
      .set(as('1:Administrator'))
      .send({ idVariant: 4, quantity: 5, reason: 'Delivery' });
    expect(entry.body).toEqual({ idMovement: '10' });
    const same = await request(app)
      .post('/admin/inventory/adjustments')
      .set(as('1:Administrator'))
      .send({ idVariant: 4, newOnHand: 3, reason: 'Count' });
    expect(same.status).toBe(200);
    expect(calls.at(-1)).toEqual({ method: 'adjust', args: [1, 4, 3, 'Count'] });
  });

  it('serves the audit log and the system version to an administrator only', async () => {
    const { repository } = fake({
      query: { items: [], page: 1, size: 20, total: 0 },
      systemVersion: { schemaVersion: 11, objects: [] },
    });
    const app = appWith(createAuditRouter(kit, repository, '0.1.0', () => []));
    expect(
      (await request(app).get('/admin/audit-log?module=Orders').set(as('2:Operator'))).status,
    ).toBe(403);
    expect(
      (await request(app).get('/admin/audit-log?module=Orders').set(as('1:Administrator'))).status,
    ).toBe(200);
    expect(
      (await request(app).get('/admin/system/version').set(as('1:Administrator'))).body,
    ).toEqual({ app: '0.1.0', schemaVersion: 11, objects: [] });
  });

  it('shows the state of the jobs and the current reconciliation discrepancies to an administrator only', async () => {
    const status = [{ name: 'expirePayments', runs: 3, lastOutcome: 'Ran' }] as never;
    const { repository, calls } = fake({
      reconciliation: [{ source: 'Amounts', check: 'RefundsExceedPayment', entityKey: '9' }],
    });
    const app = appWith(createAuditRouter(kit, repository, '0.1.0', () => status));
    expect((await request(app).get('/admin/system/jobs').set(as('2:Operator'))).status).toBe(403);
    expect((await request(app).get('/admin/system/jobs').set(as('1:Administrator'))).body).toEqual(
      status,
    );
    expect((await request(app).get('/admin/system/reconciliation')).status).toBe(401);
    const found = await request(app)
      .get('/admin/system/reconciliation?limit=5')
      .set(as('1:Administrator'));
    expect(found.body).toEqual([
      { source: 'Amounts', check: 'RefundsExceedPayment', entityKey: '9' },
    ]);
    expect(calls.at(-1)).toEqual({ method: 'reconciliation', args: [5] });
    const tooMany = await request(app)
      .get('/admin/system/reconciliation?limit=501')
      .set(as('1:Administrator'));
    expect(tooMany.status).toBe(400);
  });
});

describe('order routes', () => {
  it('lists only the orders of the token owner and never accepts the staff flag from the request', async () => {
    const { repository, calls } = fake({
      list: { items: [], page: 1, size: 20, total: 0 },
      detail: { statusName: 'Cancelled' },
    });
    const app = appWith(createOrdersRouter(kit, repository));
    await request(app).get('/orders?status=2&asStaff=true&actor=99').set(as('7:Customer'));
    expect(calls.at(-1)?.args[0]).toMatchObject({
      actor: 7,
      asStaff: false,
      statusId: 2,
      search: null,
    });
    expect((await request(app).get('/admin/orders').set(as('7:Customer'))).status).toBe(403);
    await request(app).get('/admin/orders?search=PED').set(as('2:Operator'));
    expect(calls.at(-1)?.args[0]).toMatchObject({ actor: 2, asStaff: true, search: 'PED' });
  });

  it('cancels with a reason that depends on the role and answers the refreshed order', async () => {
    const { repository, calls } = fake({ detail: { statusName: 'Cancelled' } });
    const app = appWith(createOrdersRouter(kit, repository));
    const response = await request(app).post('/orders/4/cancel').set(as('7:Customer')).send({});
    expect(response.body).toEqual({ statusName: 'Cancelled' });
    expect(calls.find((call) => call.method === 'cancel')?.args).toEqual([
      7,
      4,
      'Cancelled by the customer',
    ]);
    await request(app)
      .post('/orders/4/cancel')
      .set(as('2:Operator'))
      .send({ reason: 'Oven broke' });
    expect(calls.filter((call) => call.method === 'cancel').at(-1)?.args).toEqual([
      2,
      4,
      'Oven broke',
    ]);
    expect(calls.filter((call) => call.method === 'detail').at(-1)?.args).toEqual([2, true, 4]);
  });

  it('maps the status names to the database ids and validates the return lines', async () => {
    const { repository, calls } = fake({
      detail: {},
      registerReturn: { idReturn: 1, idRefund: 2, refundAmount: '55.45' },
    });
    const app = appWith(createOrdersRouter(kit, repository));
    await request(app)
      .patch('/admin/orders/4/status')
      .set(as('2:Operator'))
      .send({ status: 'Dispatched', comment: 'On its way' });
    expect(calls.find((call) => call.method === 'changeStatus')?.args).toEqual([
      2,
      4,
      4,
      'On its way',
    ]);
    expect(
      (
        await request(app)
          .patch('/admin/orders/4/status')
          .set(as('2:Operator'))
          .send({ status: 'Cancelled' })
      ).status,
    ).toBe(400);
    const returned = await request(app)
      .post('/admin/orders/4/returns')
      .set(as('2:Operator'))
      .send({ reason: 'Crushed', lines: [{ idOrderLine: 3, quantity: 1 }] });
    expect(returned.status).toBe(201);
    expect(returned.body).toEqual({ idReturn: 1, idRefund: 2, refundAmount: '55.45' });
    expect(
      (
        await request(app)
          .post('/admin/orders/4/returns')
          .set(as('2:Operator'))
          .send({ reason: 'x', lines: [] })
      ).status,
    ).toBe(400);
  });
});

describe('checkout', () => {
  const window = {
    leadTimeDays: 0,
    earliestDeliveryDate: '2030-06-01',
    deliveryDateAllowed: true,
    depositDeadlineAt: '2030-06-02T12:00:00.000Z',
    minutesAvailable: 1440,
    minDepositHours: 2,
    depositAvailable: true,
  };
  const bank = {
    idBankAccount: 1,
    bankName: 'Bank',
    accountType: 'Checking',
    accountNumber: '1',
    holderName: 'H',
    currency: 'GTQ',
    instructions: null,
  };

  function repo(overrides: Partial<CheckoutRepositoryPort> = {}): {
    port: CheckoutRepositoryPort;
    created: unknown[];
  } {
    const created: unknown[] = [];
    const port: CheckoutRepositoryPort = {
      cartSummary: () => Promise.resolve({ idCart: 4, itemCount: 2, hasUnavailableLines: false }),
      reserve: () => Promise.resolve({ idReservation: 9, expiresAt: '2030-06-01T12:15:00.000Z' }),
      depositWindow: () => Promise.resolve(window),
      bankAccounts: () => Promise.resolve([bank]),
      createOrder: (input) => {
        created.push(input);
        return Promise.resolve({
          idOrder: 1,
          idPayment: 2,
          orderNumber: 'PED-2030-000001',
          paymentExpiresAt: '2030-06-02T12:00:00.000Z',
        });
      },
      ...overrides,
    };
    return { port, created };
  }

  it('offers the deposit with the bank accounts and never the card while there is no gateway', async () => {
    const view = await new CheckoutService(repo().port, false).paymentMethods(7, '2030-06-20');
    expect(view.methods).toEqual([
      {
        method: 'BANK_DEPOSIT',
        available: true,
        reason: null,
        deadlineAt: window.depositDeadlineAt,
      },
      { method: 'CARD', available: false, reason: 'PAYMENT_METHOD_UNAVAILABLE', deadlineAt: null },
    ]);
    expect(view.bankAccounts).toHaveLength(1);
  });

  it('explains why the deposit is not offered and hides the accounts', async () => {
    const tooSoon = await new CheckoutService(
      repo({ depositWindow: () => Promise.resolve({ ...window, deliveryDateAllowed: false }) })
        .port,
      false,
    ).paymentMethods(7, '2030-06-01');
    expect(tooSoon.methods[0]).toMatchObject({
      available: false,
      reason: 'DELIVERY_DATE_TOO_SOON',
    });
    expect(tooSoon.bankAccounts).toEqual([]);
    const noTime = await new CheckoutService(
      repo({ depositWindow: () => Promise.resolve({ ...window, depositAvailable: false }) }).port,
      false,
    ).paymentMethods(7, '2030-06-02');
    expect(noTime.methods[0]).toMatchObject({
      available: false,
      reason: 'DEPOSIT_UNAVAILABLE_FOR_DATE',
    });
  });

  it('turns the card on only when the gateway is configured', async () => {
    const view = await new CheckoutService(repo().port, true).paymentMethods(7, '2030-06-20');
    expect(view.methods[1]).toMatchObject({ method: 'CARD', available: true, reason: null });
  });

  it('refuses to reserve an empty cart or one with an unavailable line', async () => {
    const empty = await new CheckoutService(
      repo({
        cartSummary: () =>
          Promise.resolve({ idCart: null, itemCount: 0, hasUnavailableLines: false }),
      }).port,
      false,
    ).start(7);
    expect(!empty.ok && empty.error.code).toBe('CART_EMPTY');
    const stale = await new CheckoutService(
      repo({
        cartSummary: () => Promise.resolve({ idCart: 4, itemCount: 1, hasUnavailableLines: true }),
      }).port,
      false,
    ).start(7);
    expect(!stale.ok && stale.error.code).toBe('CART_HAS_UNAVAILABLE_LINES');
    const reserved = await new CheckoutService(repo().port, false).start(7);
    expect(reserved.ok && reserved.value.idReservation).toBe(9);
  });

  it('refuses the card without a gateway and a deposit without an account', async () => {
    const service = new CheckoutService(repo().port, false);
    const base = {
      userId: 7,
      idempotencyKey: 'key-0001-abcd',
      idReservation: 9,
      idAddress: 3,
      deliveryDate: '2030-06-20',
      idBankAccount: null,
    };
    const card = await service.confirm({ ...base, method: 'CARD' });
    expect(!card.ok && card.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    const noBank = await service.confirm({ ...base, method: 'BANK_DEPOSIT' });
    expect(!noBank.ok && noBank.error.httpStatus).toBe(400);
  });

  it('creates the order with a key that mixes the customer so two customers never collide', async () => {
    const { port, created } = repo();
    const result = await new CheckoutService(port, false).confirm({
      userId: 7,
      idempotencyKey: 'key-0001-abcd',
      idReservation: 9,
      idAddress: 3,
      deliveryDate: '2030-06-20',
      method: 'BANK_DEPOSIT',
      idBankAccount: 1,
    });
    expect(result.ok && result.value.orderNumber).toBe('PED-2030-000001');
    expect(created[0]).toMatchObject({
      idPaymentMethod: 2,
      idBankAccount: 1,
      storedKey: storedKeyOf(7, 'key-0001-abcd'),
    });
    expect(storedKeyOf(7, 'key-0001-abcd')).not.toBe(storedKeyOf(8, 'key-0001-abcd'));
    expect(storedKeyOf(7, 'key-0001-abcd')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serves the three routes to a customer and refuses an invalid date', async () => {
    const service = new CheckoutService(repo().port, false);
    const app = appWith(createCheckoutRouter(kit, service));
    expect(
      (await request(app).get('/checkout/payment-methods?deliveryDate=2030-06-20')).status,
    ).toBe(401);
    expect(
      (await request(app).get('/checkout/payment-methods?deliveryDate=soon').set(as('7:Customer')))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get('/checkout/payment-methods?deliveryDate=2030-06-20')
          .set(as('7:Customer'))
      ).status,
    ).toBe(200);
    expect((await request(app).post('/checkout/start').set(as('7:Customer')).send({})).status).toBe(
      201,
    );
    const confirmed = await request(app)
      .post('/checkout/confirm')
      .set(as('7:Customer'))
      .set('Idempotency-Key', 'key-0001-abcd')
      .send({
        idReservation: 9,
        idAddress: 3,
        deliveryDate: '2030-06-20',
        method: 'BANK_DEPOSIT',
        idBankAccount: 1,
      });
    expect(confirmed.status).toBe(201);
    expect(
      (await request(app).post('/checkout/confirm').set(as('1:Administrator')).send({})).status,
    ).toBe(403);
  });
});

describe('payments', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(32),
  ]);

  function memoryStorage(): { storage: FileStoragePort; files: Map<string, Buffer> } {
    const files = new Map<string, Buffer>();
    return {
      files,
      storage: {
        save: (key, data) => {
          files.set(key, data);
          return Promise.resolve();
        },
        open: (key) => Readable.from(files.get(key) ?? Buffer.alloc(0)),
        remove: (key) => {
          files.delete(key);
          return Promise.resolve();
        },
      },
    };
  }

  const openPayment = {
    idPayment: 11,
    idPaymentStatus: 1,
    idPaymentMethod: 2,
    proofs: [{ idPaymentProof: 5 }],
  };
  const fields = { referenceNumber: 'REF-1', depositDate: '2030-06-01', depositedAmount: '200.00' };

  function build(answers: Record<string, unknown>) {
    const { repository, calls } = fake(answers);
    const { storage, files } = memoryStorage();
    const service = new PaymentsService(repository, storage);
    return { app: appWith(createPaymentsRouter(kit, repository, service)), calls, files };
  }

  const upload = (app: express.Express, user: string, file: Buffer = png) =>
    request(app)
      .post('/orders/4/payment/proofs')
      .set(as(user))
      .field('referenceNumber', fields.referenceNumber)
      .field('depositDate', fields.depositDate)
      .field('depositedAmount', fields.depositedAmount)
      .attach('file', file, { filename: 'receipt.png', contentType: 'image/png' });

  it('stores the proof under an opaque key and registers it against the open deposit', async () => {
    const { app, calls, files } = build({ paymentsOfOrder: [openPayment], registerProof: 5 });
    const response = await upload(app, '7:Customer');
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ idPaymentProof: 5, idPayment: 11 });
    const registered = calls.find((call) => call.method === 'registerProof')?.args[0] as {
      storageKey: string;
      mimeType: string;
      sha256: string;
      userId: number;
    };
    expect(registered.userId).toBe(7);
    expect(registered.mimeType).toBe('image/png');
    expect(registered.storageKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(registered.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(files.has(registered.storageKey)).toBe(true);
  });

  it('refuses a file that is not an image or a PDF before saving anything', async () => {
    const { app, files } = build({ paymentsOfOrder: [openPayment] });
    const response = await upload(app, '7:Customer', Buffer.from('MZ not an image'));
    expect(response.status).toBe(415);
    expect(codeOf(response)).toBe('UNSUPPORTED_FILE_TYPE');
    expect(files.size).toBe(0);
  });

  it('refuses a proof when no deposit is waiting for it and when the file is missing', async () => {
    const { app } = build({ paymentsOfOrder: [{ ...openPayment, idPaymentStatus: 3 }] });
    const noDeposit = await upload(app, '7:Customer');
    expect(noDeposit.status).toBe(422);
    expect(codeOf(noDeposit)).toBe('NO_PENDING_DEPOSIT');
    const noFile = await request(app)
      .post('/orders/4/payment/proofs')
      .set(as('7:Customer'))
      .field('referenceNumber', 'R')
      .field('depositDate', '2030-06-01')
      .field('depositedAmount', '1.00');
    expect(noFile.status).toBe(400);
  });

  it('answers 413 for a file above the limit', async () => {
    const { app } = build({ paymentsOfOrder: [openPayment] });
    const big = await upload(app, '7:Customer', Buffer.concat([png, Buffer.alloc(2048)]));
    expect(big.status).toBe(413);
    expect(codeOf(big)).toBe('PAYLOAD_TOO_LARGE');
  });

  it('deletes the stored file when the database refuses the proof', async () => {
    const { repository } = fake({ paymentsOfOrder: [openPayment] });
    const failing = new Proxy(repository, {
      get: (target, property: string) =>
        property === 'registerProof'
          ? () => Promise.reject(new AppError(409, 'REFERENCE_ALREADY_USED', 'used'))
          : (target as Record<string, unknown>)[property],
    });
    const { storage, files } = memoryStorage();
    const app = appWith(createPaymentsRouter(kit, failing, new PaymentsService(failing, storage)));
    const response = await upload(app, '7:Customer');
    expect(response.status).toBe(409);
    expect(files.size).toBe(0);
  });

  it('serves a proof inline with private headers, only through the order of the caller', async () => {
    const { repository } = fake({
      paymentsOfOrder: [openPayment],
      getProof: {
        storageKey: 'a1b2c3d4-0000-4000-8000-000000000001',
        mimeType: 'image/png',
        originalFileName: 'receipt.png',
        sizeBytes: png.length,
      },
    });
    const { storage, files } = memoryStorage();
    files.set('a1b2c3d4-0000-4000-8000-000000000001', png);
    const app = appWith(
      createPaymentsRouter(kit, repository, new PaymentsService(repository, storage)),
    );
    const response = await request(app).get('/orders/4/payment/proofs/5').set(as('7:Customer'));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toBe('inline; filename="receipt.png"');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    const unknown = await request(app).get('/orders/4/payment/proofs/99').set(as('7:Customer'));
    expect(unknown.status).toBe(404);
  });

  it('keeps the review, the accounts and the refunds in the hands of the right roles', async () => {
    const { app, calls } = build({
      listDeposits: { items: [], page: 1, size: 20, total: 0 },
      approve: 'Approved',
      reject: 'Rejected',
      listBankAccounts: [],
      saveBankAccount: 3,
      listRefunds: [],
      markRefund: undefined,
      createAttempt: { idPayment: 12, expiresAt: 'x' },
    });
    expect((await request(app).get('/admin/payments/deposits').set(as('7:Customer'))).status).toBe(
      403,
    );
    await request(app).get('/admin/payments/deposits?status=Rejected').set(as('2:Operator'));
    expect(calls.at(-1)?.args[0]).toMatchObject({ statusId: 4, page: 1, size: 20 });
    expect(
      (await request(app).post('/admin/payments/11/approve').set(as('2:Operator')).send({})).body,
    ).toEqual({ outcome: 'Approved' });
    expect(
      (await request(app).post('/admin/payments/11/reject').set(as('2:Operator')).send({})).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/admin/payments/11/reject')
          .set(as('2:Operator'))
          .send({ reason: 'Blurry' })
      ).body,
    ).toEqual({ outcome: 'Rejected' });

    const account = { bankName: 'B', accountType: 'Savings', accountNumber: '1', holderName: 'H' };
    expect(
      (await request(app).post('/admin/bank-accounts').set(as('2:Operator')).send(account)).status,
    ).toBe(403);
    expect(
      (await request(app).post('/admin/bank-accounts').set(as('1:Administrator')).send(account))
        .status,
    ).toBe(201);
    expect(
      (await request(app).put('/admin/bank-accounts/3').set(as('1:Administrator')).send(account))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get('/admin/refunds?status=Pending').set(as('1:Administrator'))).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch('/admin/refunds/8')
          .set(as('2:Operator'))
          .send({ status: 'Processed', externalReference: 'T' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch('/admin/refunds/8')
          .set(as('1:Administrator'))
          .send({ status: 'Processed', externalReference: 'T' })
      ).status,
    ).toBe(200);
    expect(calls.at(-1)).toEqual({ method: 'markRefund', args: [1, 8, 'Processed', 'T'] });

    const attempt = await request(app)
      .post('/orders/4/payment/attempts')
      .set(as('7:Customer'))
      .set('Idempotency-Key', 'key-0001-abcd')
      .send({});
    expect(attempt.status).toBe(201);
    expect(calls.find((call) => call.method === 'createAttempt')?.args[2] as string).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect((await request(app).get('/orders/4/payment').set(as('7:Customer'))).status).toBe(200);
    expect((await request(app).get('/admin/orders/4/payment').set(as('2:Operator'))).status).toBe(
      200,
    );
  });
});
