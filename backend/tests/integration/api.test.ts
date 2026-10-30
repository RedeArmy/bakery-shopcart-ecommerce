import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sql from 'mssql';
import request from 'supertest';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/composition-root.js';
import type { Container } from '../../src/composition-root.js';
import { loadEnv } from '../../src/platform/config/env.js';
import { argon2PasswordHasher } from '../../src/platform/security/passwords.js';

/**
 * Flujos completos contra un SQL Server real, por HTTP: catálogo, carrito, checkout, depósito con comprobante, revisión,
 * entrega, devolución, reembolso, cancelación y los accesos ajenos (IDOR). Se salta sola si no hay servidor configurado.
 * Deja sus datos en la base: está pensada para una base desechable (la del CI o la de pruebas locales).
 */
const configured = process.env['SQL_TEST_HOST'] !== undefined;

type Json = Record<string, unknown>;
const field = (value: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => (current as Json | undefined)?.[key], value);
const num = (value: unknown, path: string): number => field(value, path) as number;
const str = (value: unknown, path: string): string => field(value, path) as string;
const list = (value: unknown, path: string): Json[] => field(value, path) as Json[];

const runId = Date.now().toString(36);
// El contenido lleva el identificador de la ejecución: la base conserva las huellas de los archivos de ejecuciones anteriores
const png = (fill: number): Buffer =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`${runId}-${fill}`),
    Buffer.alloc(64, fill),
  ]);
/** Ejecuta una tras otra, esperando cada una: el orden importa y no se hace `await` dentro de un bucle. */
const inOrder = <T, R>(items: readonly T[], step: (item: T) => Promise<R>): Promise<R[]> =>
  items.reduce<Promise<R[]>>(
    async (done, item) => [...(await done), await step(item)],
    Promise.resolve([]),
  );
const PNG = png(7);
const OTHER_PNG = png(9);

describe.skipIf(!configured)('API against a real SQL Server', () => {
  const password = 'A long enough password 1!';
  let container: Container;
  let limited: Container;
  let storageDir: string;
  let admin: SA;
  let counter = 0;

  interface SA {
    query: (text: string) => Promise<sql.IResult<Json>>;
    close: () => Promise<void>;
  }

  const key = (): string => `it-${runId}-${(counter += 1)}`;
  const deliveryDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const api = (): ReturnType<typeof request> => request(container.app);

  const as = (token: string, call: Test): Test => call.set('Authorization', `Bearer ${token}`);
  const post = (token: string, path: string, body: unknown = {}, idempotencyKey = key()): Test =>
    as(
      token,
      api()
        .post(`/api/v1${path}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body as object),
    );
  const patch = (token: string, path: string, body: unknown): Test =>
    as(
      token,
      api()
        .patch(`/api/v1${path}`)
        .set('Idempotency-Key', key())
        .send(body as object),
    );
  const get = (token: string, path: string): Test => as(token, api().get(`/api/v1${path}`));

  async function createStaff(
    role: number,
    label: string,
  ): Promise<{ email: string; token: string }> {
    const email = `it-${label}-${runId}@shopcart.test`;
    const hash = await argon2PasswordHasher.hash(password);
    await admin.query(
      `INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName) VALUES (${role}, N'${email}', N'${hash}', N'IT ${label}')`,
    );
    return { email, token: await login(email) };
  }

  async function login(email: string): Promise<string> {
    const response = await api().post('/api/v1/auth/login').send({ email, password });
    expect(response.status).toBe(200);
    return str(response.body, 'accessToken');
  }

  async function newCustomer(label: string): Promise<{ token: string; idAddress: number }> {
    const email = `it-${label}-${runId}@shopcart.test`;
    const registered = await api()
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: `IT ${label}` });
    expect(registered.status).toBe(201);
    const token = await login(email);
    const address = await post(token, '/addresses', {
      label: 'Home',
      recipient: `IT ${label}`,
      phone: '55550000',
      line1: '5th Avenue 10-20',
      municipality: 'Guatemala',
      department: 'Guatemala',
    });
    expect(address.status).toBe(201);
    return { token, idAddress: num(address.body, 'idAddress') };
  }

  let operator: string;
  let administrator: string;
  let idVariant: number;
  let idProduct: number;
  let idBankAccount: number;
  let customerA: { token: string; idAddress: number };
  let customerB: { token: string; idAddress: number };

  /** Carrito de la cantidad pedida → reserva → pedido de depósito. Devuelve los identificadores del pedido. */
  async function placeOrder(
    customer: { token: string; idAddress: number },
    quantity: number,
  ): Promise<{ idOrder: number; idPayment: number }> {
    const cart = await as(customer.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({
      quantity,
    });
    expect(cart.status).toBe(200);
    const started = await post(customer.token, '/checkout/start');
    expect(started.status).toBe(201);
    const confirmed = await post(customer.token, '/checkout/confirm', {
      idReservation: num(started.body, 'idReservation'),
      idAddress: customer.idAddress,
      deliveryDate,
      method: 'BANK_DEPOSIT',
      idBankAccount,
    });
    expect(confirmed.status).toBe(201);
    return { idOrder: num(confirmed.body, 'idOrder'), idPayment: num(confirmed.body, 'idPayment') };
  }

  const uploadProof = (
    token: string,
    idOrder: number,
    reference: string,
    amount: string,
    file = PNG,
  ): Test =>
    as(token, api().post(`/api/v1/orders/${idOrder}/payment/proofs`))
      .set('Idempotency-Key', key())
      .field('referenceNumber', reference)
      .field('depositDate', today)
      .field('depositedAmount', amount)
      .attach('file', file, { filename: 'receipt.png', contentType: 'image/png' });

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'shopcart-proofs-'));
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      DB_HOST: process.env['SQL_TEST_HOST'],
      DB_PORT: process.env['SQL_TEST_PORT'] ?? '1433',
      DB_NAME: process.env['DB_NAME'] ?? 'ShopCart_CI',
      DB_TRUST_SERVER_CERTIFICATE: 'true',
      LOG_LEVEL: 'silent',
      PAYMENT_PROOFS_DIR: storageDir,
    });
    container = buildContainer(env, { disableRateLimit: true });
    limited = buildContainer(env);

    // Las cuentas del personal no se pueden crear por la API: se siembran con el login administrador de la base de pruebas
    const pool = await new sql.ConnectionPool({
      server: env.DB_HOST,
      port: env.DB_PORT,
      user: 'sa',
      password: process.env['SQL_TEST_PASSWORD'] ?? '',
      database: env.DB_NAME,
      options: { trustServerCertificate: true, encrypt: true },
    }).connect();
    admin = {
      query: (text) => pool.request().query<Json>(text),
      close: () => pool.close(),
    };

    administrator = (await createStaff(3, 'admin')).token;
    operator = (await createStaff(2, 'operator')).token;

    // Catálogo mínimo por la API de administración
    const category = await post(administrator, '/admin/categories', { name: `IT Cakes ${runId}` });
    expect(category.status).toBe(201);
    const product = await post(administrator, '/admin/products', {
      categoryId: num(category.body, 'idCategory'),
      name: `IT Milk cake ${runId}`,
      description: 'Integration product',
      leadTimeDays: 0,
    });
    idProduct = num(product.body, 'idProduct');
    const variant = await post(administrator, '/admin/variants', {
      productId: idProduct,
      sku: `IT${runId}`.toUpperCase(),
      price: '100.00',
      attributes: [{ name: 'Size', value: 'M' }],
    });
    expect(variant.status).toBe(201);
    idVariant = num(variant.body, 'idVariant');
    const entry = await post(administrator, '/admin/inventory/entries', {
      idVariant,
      quantity: 20,
      reason: 'Initial stock',
    });
    expect(entry.status).toBe(201);
    const bank = await post(administrator, '/admin/bank-accounts', {
      bankName: `IT Bank ${runId}`,
      accountType: 'Checking',
      accountNumber: `ACC-${runId}`,
      holderName: 'Dulce Aroma',
    });
    idBankAccount = num(bank.body, 'idBankAccount');

    customerA = await newCustomer('ana');
    customerB = await newCustomer('luis');
  });

  afterAll(async () => {
    await container.database.close();
    await limited.database.close();
    await admin.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  // --- Público y seguridad ----------------------------------------------------------------

  it('serves the public catalogue without a token', async () => {
    const tree = await api().get('/api/v1/categories');
    expect(tree.status).toBe(200);
    expect(JSON.stringify(tree.body)).toContain(`IT Cakes ${runId}`);

    const search = await api()
      .get('/api/v1/products')
      .query({ q: `IT Milk cake ${runId}` });
    expect(search.status).toBe(200);
    expect(num(search.body, 'total')).toBe(1);
    expect(str(list(search.body, 'items')[0], 'minPrice')).toBe('100.00');

    const detail = await api().get(`/api/v1/products/${idProduct}`);
    expect(detail.status).toBe(200);
    expect(list(detail.body, 'variants')[0]?.['onHandStock']).toBe(20);
  });

  it('refuses a missing token, a wrong role, a missing idempotency key and an unknown route', async () => {
    expect((await api().get('/api/v1/admin/orders')).status).toBe(401);
    expect((await get(customerA.token, '/admin/orders')).status).toBe(403);
    expect((await get(customerA.token, '/admin/users')).status).toBe(403);
    expect((await get(operator, '/admin/users')).status).toBe(403);
    const noKey = await as(customerA.token, api().post('/api/v1/checkout/start')).send({});
    expect(noKey.status).toBe(400);
    expect(str(noKey.body, 'error.code')).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const invalid = await post(administrator, '/admin/categories', { name: '' });
    expect(invalid.status).toBe(400);
    expect(str(invalid.body, 'error.code')).toBe('VALIDATION_ERROR');
    expect((await api().get('/api/v1/nope')).status).toBe(404);
  });

  it('rate limits the login after five attempts in a minute', async () => {
    const attempts = await inOrder([1, 2, 3, 4, 5, 6], async () => {
      const response = await request(limited.app)
        .post('/api/v1/auth/login')
        .send({ email: `nobody-${runId}@shopcart.test`, password: 'wrong password!' });
      return response.status;
    });
    expect(attempts.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(attempts[5]).toBe(429);
  });

  // --- Compra completa --------------------------------------------------------------------

  let first: { idOrder: number; idPayment: number };
  let idOrderLine: number;

  it('refuses to put more units in the cart than the stock available', async () => {
    const above = await as(customerA.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({
      quantity: 21,
    });
    expect(above.status).toBe(409);
    const error = above.body as { error: { code: string; message: string } };
    expect(error.error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.error.message).toBe('Only 20 units are available.');

    const exact = await as(customerA.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({
      quantity: 20,
    });
    expect(exact.status).toBe(200);
  });

  it('prices the cart in the database and offers the deposit with the bank accounts', async () => {
    const cart = await as(customerA.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({
      quantity: 2,
    });
    expect(cart.status).toBe(200);
    expect(str(cart.body, 'total')).toBe('200.00');
    expect(num(cart.body, 'itemCount')).toBe(2);

    const methods = await get(
      customerA.token,
      `/checkout/payment-methods?deliveryDate=${deliveryDate}`,
    );
    expect(methods.status).toBe(200);
    const offers = list(methods.body, 'methods');
    expect(offers.find((offer) => offer['method'] === 'BANK_DEPOSIT')?.['available']).toBe(true);
    expect(offers.find((offer) => offer['method'] === 'CARD')?.['available']).toBe(false);
    expect(JSON.stringify(list(methods.body, 'bankAccounts'))).toContain(`IT Bank ${runId}`);

    // Hoy mismo no hay tiempo para un depósito
    const tooSoon = await get(customerA.token, `/checkout/payment-methods?deliveryDate=${today}`);
    expect(
      list(tooSoon.body, 'methods').find((offer) => offer['method'] === 'BANK_DEPOSIT')?.[
        'available'
      ],
    ).toBe(false);
  });

  it('creates the order once even when the confirmation is repeated, and refuses the same key with another body', async () => {
    const started = await post(customerA.token, '/checkout/start');
    expect(started.status).toBe(201);
    const body = {
      idReservation: num(started.body, 'idReservation'),
      idAddress: customerA.idAddress,
      deliveryDate,
      method: 'BANK_DEPOSIT',
      idBankAccount,
    };
    const sharedKey = key();
    const created = await post(customerA.token, '/checkout/confirm', body, sharedKey);
    expect(created.status).toBe(201);
    expect(str(created.body, 'orderNumber')).toMatch(/^PED-\d{4}-\d{6}$/);
    first = { idOrder: num(created.body, 'idOrder'), idPayment: num(created.body, 'idPayment') };

    const replay = await post(customerA.token, '/checkout/confirm', body, sharedKey);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(num(replay.body, 'idOrder')).toBe(first.idOrder);

    const reused = await post(
      customerA.token,
      '/checkout/confirm',
      { ...body, idBankAccount: idBankAccount + 1 },
      sharedKey,
    );
    expect(reused.status).toBe(422);
    expect(str(reused.body, 'error.code')).toBe('IDEMPOTENCY_KEY_REUSED');

    const orders = await get(customerA.token, '/orders');
    expect(num(orders.body, 'total')).toBe(1);
    const detail = await get(customerA.token, `/orders/${first.idOrder}`);
    expect(str(detail.body, 'statusName')).toBe('PendingPayment');
    expect(str(detail.body, 'total')).toBe('200.00');
    idOrderLine = num(list(detail.body, 'lines')[0], 'idOrderLine');
  });

  it('keeps every order, payment and proof away from another customer', async () => {
    expect((await get(customerB.token, `/orders/${first.idOrder}`)).status).toBe(404);
    expect((await get(customerB.token, `/orders/${first.idOrder}/payment`)).status).toBe(404);
    expect((await post(customerB.token, `/orders/${first.idOrder}/cancel`)).status).toBe(404);
    expect(
      (await uploadProof(customerB.token, first.idOrder, `STOLEN-${runId}`, '200.00')).status,
    ).toBe(404);
    expect(num((await get(customerB.token, '/orders')).body, 'total')).toBe(0);
    expect(
      (
        await as(customerB.token, api().put(`/api/v1/addresses/${customerA.idAddress}`)).send({
          label: 'x',
          recipient: 'x',
          phone: '55550000',
          line1: 'x',
          municipality: 'x',
          department: 'x',
        })
      ).status,
    ).toBe(404);
  });

  it('rejects a file that is not an image or a PDF and a file above the limit', async () => {
    const fake = await uploadProof(
      customerA.token,
      first.idOrder,
      `FAKE-${runId}`,
      '200.00',
      Buffer.from('not an image at all'),
    );
    expect(fake.status).toBe(415);
    expect(str(fake.body, 'error.code')).toBe('UNSUPPORTED_FILE_TYPE');
    const big = await uploadProof(
      customerA.token,
      first.idOrder,
      `BIG-${runId}`,
      '200.00',
      Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]),
    );
    expect(big.status).toBe(413);
  });

  it('registers the proof, puts the payment under review and serves the file only to its owner and to staff', async () => {
    const proof = await uploadProof(customerA.token, first.idOrder, `REF-${runId}`, '200.00');
    expect(proof.status).toBe(201);
    const idProof = num(proof.body, 'idPaymentProof');

    const payment = await get(customerA.token, `/orders/${first.idOrder}/payment`);
    expect(num((payment.body as Json[])[0], 'idPaymentStatus')).toBe(2);
    expect(list((payment.body as Json[])[0], 'proofs')).toHaveLength(1);

    const download = await get(
      customerA.token,
      `/orders/${first.idOrder}/payment/proofs/${idProof}`,
    );
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('image/png');
    expect(download.headers['cache-control']).toContain('no-store');
    expect(Buffer.from(download.body as Buffer)).toHaveLength(PNG.length);

    expect(
      (await get(customerB.token, `/orders/${first.idOrder}/payment/proofs/${idProof}`)).status,
    ).toBe(404);
    expect(
      (await get(operator, `/admin/payments/${first.idPayment}/proofs/${idProof}`)).status,
    ).toBe(200);
    expect(
      (await get(customerA.token, `/admin/payments/${first.idPayment}/proofs/${idProof}`)).status,
    ).toBe(403);
  });

  it('shows the deposit in the review queue and lets an operator approve it once', async () => {
    const queue = await get(operator, '/admin/payments/deposits');
    expect(list(queue.body, 'items').some((item) => item['idPayment'] === first.idPayment)).toBe(
      true,
    );

    const approved = await post(operator, `/admin/payments/${first.idPayment}/approve`);
    expect(approved.status).toBe(200);
    expect(str(approved.body, 'outcome')).toBe('Approved');
    const again = await post(operator, `/admin/payments/${first.idPayment}/approve`);
    expect(str(again.body, 'outcome')).toBe('AlreadyApproved');

    const order = await get(operator, `/admin/orders/${first.idOrder}`);
    expect(str(order.body, 'statusName')).toBe('Paid');
    const product = await api().get(`/api/v1/products/${idProduct}`);
    expect(list(product.body, 'variants')[0]?.['onHandStock']).toBe(18);
  });

  it('takes the order through preparation, dispatch and delivery, then returns one unit and refunds it', async () => {
    // Cada paso necesita que el anterior ya esté aplicado
    await inOrder(['InPreparation', 'Dispatched', 'Delivered'], async (status) => {
      const changed = await patch(operator, `/admin/orders/${first.idOrder}/status`, { status });
      expect(changed.status).toBe(200);
      expect(str(changed.body, 'statusName')).toBe(status);
    });
    expect(
      (await patch(operator, `/admin/orders/${first.idOrder}/status`, { status: 'InPreparation' }))
        .status,
    ).toBe(422);

    const returned = await post(operator, `/admin/orders/${first.idOrder}/returns`, {
      reason: 'Crushed box',
      lines: [{ idOrderLine, quantity: 1 }],
    });
    expect(returned.status).toBe(201);
    expect(str(returned.body, 'refundAmount')).toBe('100.00');
    const tooMany = await post(operator, `/admin/orders/${first.idOrder}/returns`, {
      reason: 'Again',
      lines: [{ idOrderLine, quantity: 2 }],
    });
    expect(tooMany.status).toBe(422);
    expect(str(tooMany.body, 'error.code')).toBe('RETURN_QUANTITY_EXCEEDED');

    const pending = await get(administrator, '/admin/refunds?status=Pending');
    const refund = (pending.body as Json[]).find((row) => row['idPayment'] === first.idPayment);
    expect(str(refund, 'amountText')).toBe('100.00');
    expect(
      (
        await patch(operator, `/admin/refunds/${num(refund, 'idRefund')}`, {
          status: 'Processed',
          externalReference: 'TRF-1',
        })
      ).status,
    ).toBe(403);
    const processed = await patch(administrator, `/admin/refunds/${num(refund, 'idRefund')}`, {
      status: 'Processed',
      externalReference: `TRF-${runId}`,
    });
    expect(processed.status).toBe(200);

    const order = await get(customerA.token, `/orders/${first.idOrder}`);
    expect(str(order.body, 'statusName')).toBe('PartiallyReturned');
    const product = await api().get(`/api/v1/products/${idProduct}`);
    expect(list(product.body, 'variants')[0]?.['onHandStock']).toBe(19);
  });

  it('lets the customer cancel an order that is waiting for payment and frees the stock', async () => {
    const second = await placeOrder(customerA, 1);
    const cancelled = await post(customerA.token, `/orders/${second.idOrder}/cancel`, {});
    expect(cancelled.status).toBe(200);
    expect(str(cancelled.body, 'statusName')).toBe('Cancelled');
    const product = await api().get(`/api/v1/products/${idProduct}`);
    expect(list(product.body, 'variants')[0]?.['onHandStock']).toBe(19);
  });

  it('lets an operator reject a deposit with a reason and the customer open another attempt', async () => {
    const order = await placeOrder(customerB, 1);
    expect(
      (await uploadProof(customerB.token, order.idOrder, `RJ-${runId}`, '100.00', OTHER_PNG))
        .status,
    ).toBe(201);

    const noReason = await post(operator, `/admin/payments/${order.idPayment}/reject`, {});
    expect(noReason.status).toBe(400);
    const rejected = await post(operator, `/admin/payments/${order.idPayment}/reject`, {
      reason: 'Blurry photo',
    });
    expect(str(rejected.body, 'outcome')).toBe('Rejected');

    const payments = await get(customerB.token, `/orders/${order.idOrder}/payment`);
    expect(str((payments.body as Json[])[0], 'rejectionReason')).toBe('Blurry photo');
    expect(num((payments.body as Json[])[0], 'attemptsRejected')).toBe(1);

    const attempt = await post(customerB.token, `/orders/${order.idOrder}/payment/attempts`, {});
    expect(attempt.status).toBe(201);
    expect(
      (await uploadProof(customerB.token, order.idOrder, `RJ2-${runId}`, '100.00', OTHER_PNG))
        .status,
    ).toBe(201);
  });

  // --- Administración ----------------------------------------------------------------------

  it('lets the administrator manage coupons, accounts and read the audit log and the system version', async () => {
    const coupon = await post(administrator, '/admin/coupons', {
      code: `IT${runId}`,
      type: 'Percentage',
      value: '10.00',
      startsAt: '2020-01-01T00:00:00Z',
      endsAt: '2099-12-31T00:00:00Z',
    });
    expect(coupon.status).toBe(201);
    // El carrito de Ana se convirtió en pedido: se arma uno nuevo para poder aplicar el cupón
    await as(customerA.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({ quantity: 1 });
    const applied = await post(customerA.token, '/cart/coupon', {
      code: `IT${runId}`.toLowerCase(),
    });
    expect(applied.status).toBe(200);
    expect(str(applied.body, 'couponReason')).toBeDefined();

    const users = await get(administrator, `/admin/users?search=${runId}`);
    expect(num(users.body, 'total')).toBeGreaterThanOrEqual(4);
    const audit = await get(administrator, '/admin/audit-log?module=Products');
    expect(num(audit.body, 'total')).toBeGreaterThan(0);
    const version = await get(administrator, '/admin/system/version');
    expect(num(version.body, 'schemaVersion')).toBeGreaterThan(0);
    expect(list(version.body, 'objects').length).toBeGreaterThan(50);

    const ledger = await get(operator, `/admin/inventory/ledger?variant=${idVariant}`);
    expect(list(ledger.body, 'items').map((row) => row['movementType'])).toEqual(
      expect.arrayContaining(['Entry', 'Exit', 'Return']),
    );
  });

  it('expires an unpaid order with the job runner against the database and reports the state of the jobs', async () => {
    const order = await placeOrder(customerB, 1);
    const before = num(
      await api()
        .get(`/api/v1/products/${idProduct}`)
        .then((r) => list(r.body, 'variants')[0]),
      'onHandStock',
    );
    // Se vence el plazo del pago como si hubiera pasado el tiempo
    await admin.query(
      `UPDATE dbo.Payments SET ExpiresAt = DATEADD(HOUR, -1, SYSUTCDATETIME()) WHERE IDPayment = ${order.idPayment}`,
    );

    const expire = await container.jobs.runNow('expirePayments');
    expect(expire.lastOutcome).toBe('Ran');
    expect(expire.lastCounts?.['expiredOrders']).toBeGreaterThanOrEqual(1);
    const cancelled = await get(customerB.token, `/orders/${order.idOrder}`);
    expect(str(cancelled.body, 'statusName')).toBe('Cancelled');
    expect(
      str(
        (await get(customerB.token, `/orders/${order.idOrder}/payment`)).body as unknown,
        '0.statusName',
      ),
    ).toBe('Expired');
    // Lo reservado volvió: el stock físico no cambió porque nunca se pagó
    const after = num(
      await api()
        .get(`/api/v1/products/${idProduct}`)
        .then((r) => list(r.body, 'variants')[0]),
      'onHandStock',
    );
    expect(after).toBe(before);

    expect((await container.jobs.runNow('purgeExpired')).lastOutcome).toBe('Ran');
    expect((await container.jobs.runNow('reconcileAmounts')).lastOutcome).toBe('Ran');

    expect((await get(customerB.token, '/admin/system/jobs')).status).toBe(403);
    const jobs = await get(administrator, '/admin/system/jobs');
    const names = (jobs.body as Json[]).map((job) => job['name']);
    expect(names).toEqual(['expirePayments', 'purgeExpired', 'reconcileAmounts']);
    expect(num((jobs.body as Json[])[0], 'runs')).toBeGreaterThanOrEqual(1);
    const reconciliation = await get(administrator, '/admin/system/reconciliation');
    expect(reconciliation.status).toBe(200);
    expect((reconciliation.body as Json[]).filter((row) => row['source'] === 'Amounts')).toEqual(
      [],
    );
  });

  it('serves the dashboard to an administrator, consistent across its reports', async () => {
    // Hoy en Guatemala (UTC-6): todas las ventas de esta ejecución se pagaron hace unos segundos
    const todayLocal = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
    const range = `from=${todayLocal}&to=${todayLocal}`;
    const toCents = (text: unknown): bigint => BigInt(String(text).replace('.', ''));

    for (const path of [
      'summary',
      'sales',
      'sales-by-category',
      'top-products',
      'abandoned-carts',
    ]) {
      expect((await get(customerA.token, `/admin/dashboard/${path}`)).status).toBe(403);
      expect((await get(operator, `/admin/dashboard/${path}`)).status).toBe(403);
    }

    const summary = await get(administrator, `/admin/dashboard/summary?${range}`);
    expect(summary.status).toBe(200);
    expect(num(summary.body, 'orders')).toBeGreaterThanOrEqual(1);
    // La venta neta es la bruta menos lo devuelto (hubo una devolución de 100.00 en esta ejecución)
    expect(toCents(str(summary.body, 'gross')) - toCents(str(summary.body, 'returned'))).toBe(
      toCents(str(summary.body, 'net')),
    );
    expect(toCents(str(summary.body, 'returned'))).toBeGreaterThanOrEqual(10000n);

    // La serie diaria de hoy, las categorías y el resumen cuentan la misma venta neta
    const series = await get(administrator, `/admin/dashboard/sales?${range}&granularity=day`);
    expect(series.status).toBe(200);
    expect((series.body as Json[]).map((row) => row['periodStart'])).toEqual([todayLocal]);
    expect(str((series.body as Json[])[0], 'net')).toBe(str(summary.body, 'net'));
    const categories = await get(administrator, `/admin/dashboard/sales-by-category?${range}`);
    const categoryTotal = (categories.body as Json[]).reduce(
      (sum, row) => sum + toCents(row['net']),
      0n,
    );
    expect(categoryTotal).toBe(toCents(str(summary.body, 'net')));
    expect(JSON.stringify(categories.body)).toContain(`IT Cakes ${runId}`);

    const top = await get(administrator, `/admin/dashboard/top-products?${range}&limit=5`);
    expect(top.status).toBe(200);
    expect((top.body as Json[]).length).toBeLessThanOrEqual(5);
    expect((top.body as Json[]).map((row) => row['position'])).toEqual(
      (top.body as Json[]).map((_row, index) => index + 1),
    );
    expect(JSON.stringify(top.body)).toContain(`IT Milk cake ${runId}`);

    // Sin fechas: los últimos 30 días, uno por uno aunque no haya ventas
    const month = await get(administrator, '/admin/dashboard/sales');
    expect(month.body as Json[]).toHaveLength(30);
    const weeks = await get(
      administrator,
      `/admin/dashboard/sales?from=2030-01-01&to=2030-03-31&granularity=week`,
    );
    expect((weeks.body as Json[]).every((row) => num(row, 'orders') === 0)).toBe(true);

    const abandoned = await get(administrator, '/admin/dashboard/abandoned-carts?size=5');
    expect(abandoned.status).toBe(200);
    expect(num(abandoned.body, 'size')).toBe(5);

    expect((await get(administrator, '/admin/dashboard/summary?from=yesterday')).status).toBe(400);
    expect(
      (await get(administrator, '/admin/dashboard/sales?from=2030-06-05&to=2030-06-01')).status,
    ).toBe(400);
    expect(
      (
        await get(
          administrator,
          '/admin/dashboard/sales?from=2020-01-01&to=2030-01-01&granularity=day',
        )
      ).status,
    ).toBe(400);
  });

  it('keeps the money and the stock reconciled after all the flows', async () => {
    const money = await admin.query('SELECT Total = COUNT(*) FROM dbo.VW_Reconciliation_Amounts');
    expect(money.recordset[0]?.['Total']).toBe(0);
    const stock = await admin.query(
      `SELECT Total = COUNT(*) FROM dbo.VW_Inventory_Reconciliation WHERE IDVariant = ${idVariant}`,
    );
    expect(stock.recordset[0]?.['Total']).toBe(0);
  });
});
