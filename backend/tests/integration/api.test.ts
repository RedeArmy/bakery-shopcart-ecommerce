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
  // La entrega se interpreta a las 00:00 de Guatemala (UTC-6): "hoy" es el día de Guatemala, no el de UTC, que desde las 18:00
  // locales ya es el siguiente y daría tiempo para un depósito
  const today = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
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
      holderName: 'Pastelería',
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

  it('keeps the session in an HttpOnly cookie: renews from it, detects a reused token and clears it on logout', async () => {
    const email = `it-cookie-${runId}@shopcart.test`;
    await api().post('/api/v1/auth/register').send({ email, password, fullName: 'IT cookie' });
    const cookieOf = (response: { headers: Record<string, unknown> }): string =>
      ((response.headers['set-cookie'] as string[] | undefined) ?? [])[0] ?? '';
    const pair = (cookie: string): string => cookie.split(';')[0] ?? '';

    const signedIn = await api().post('/api/v1/auth/login').send({ email, password });
    expect(signedIn.status).toBe(200);
    const firstCookie = cookieOf(signedIn);
    expect(firstCookie).toMatch(/HttpOnly/);
    expect(firstCookie).toMatch(/SameSite=Strict/);
    expect(firstCookie).toContain('Path=/api/v1/auth');
    expect(pair(firstCookie)).toBe(`refreshToken=${str(signedIn.body, 'refreshToken')}`);

    // Solo con la cookie, como lo hace el navegador: sin cuerpo
    const renewed = await api().post('/api/v1/auth/refresh').set('Cookie', pair(firstCookie));
    expect(renewed.status).toBe(200);
    const secondCookie = cookieOf(renewed);
    expect(pair(secondCookie)).not.toBe(pair(firstCookie));
    expect(str(renewed.body, 'accessToken').length).toBeGreaterThan(20);

    // El token viejo ya se usó: la base de datos cierra toda la familia y la cookie se borra
    const reused = await api().post('/api/v1/auth/refresh').set('Cookie', pair(firstCookie));
    expect(reused.status).toBe(401);
    expect(str(reused.body, 'error.code')).toBe('REFRESH_TOKEN_REUSED');
    expect(cookieOf(reused)).toContain('Expires=Thu, 01 Jan 1970');
    const afterReuse = await api().post('/api/v1/auth/refresh').set('Cookie', pair(secondCookie));
    expect(afterReuse.status).toBe(401);

    const again = await api().post('/api/v1/auth/login').send({ email, password });
    const loggedOut = await api()
      .post('/api/v1/auth/logout')
      .set('Cookie', pair(cookieOf(again)));
    expect(loggedOut.status).toBe(204);
    expect(cookieOf(loggedOut)).toContain('Expires=Thu, 01 Jan 1970');
    const afterLogout = await api()
      .post('/api/v1/auth/refresh')
      .set('Cookie', pair(cookieOf(again)));
    expect(afterLogout.status).toBe(401);
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
    expect(offers.find((offer) => offer['code'] === 'BANK_DEPOSIT')?.['available']).toBe(true);
    // Sin pasarela la tarjeta no se ofrece
    expect(offers.some((offer) => offer['kind'] === 'Card')).toBe(false);
    expect(JSON.stringify(list(methods.body, 'bankAccounts'))).toContain(`IT Bank ${runId}`);

    // Hoy mismo no hay tiempo para un depósito
    const tooSoon = await get(customerA.token, `/checkout/payment-methods?deliveryDate=${today}`);
    expect(
      list(tooSoon.body, 'methods').find((offer) => offer['code'] === 'BANK_DEPOSIT')?.[
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

  it('lets a guest check out with a deposit and recover the order, while coupons, made-to-order products and personalisation need an account', async () => {
    // Un producto por encargo (pide dos días) y uno del mismo día (el de los demás flujos)
    const category = await post(administrator, '/admin/categories', { name: `IT Custom ${runId}` });
    const madeToOrder = await post(administrator, '/admin/products', {
      categoryId: num(category.body, 'idCategory'),
      name: `IT Custom cake ${runId}`,
      description: 'Made to order',
      leadTimeDays: 2,
    });
    const customVariant = await post(administrator, '/admin/variants', {
      productId: num(madeToOrder.body, 'idProduct'),
      sku: `ITC${runId}`.toUpperCase(),
      price: '300.00',
      attributes: [{ name: 'Size', value: 'L' }],
    });
    const idCustomVariant = num(customVariant.body, 'idVariant');
    await post(administrator, '/admin/inventory/entries', {
      idVariant: idCustomVariant,
      quantity: 5,
      reason: 'Initial stock',
    });
    const couponCode = `GUEST${runId}`.toUpperCase();
    const coupon = await post(administrator, '/admin/coupons', {
      code: couponCode,
      type: 'Percentage',
      value: '10.00',
      startsAt: '2020-01-01T00:00:00Z',
      endsAt: '2099-12-31T00:00:00Z',
    });
    expect(coupon.status).toBe(201);

    const startGuest = async (): Promise<{ token: string; idUser: number; cookie: string }> => {
      const started = await api().post('/api/v1/auth/guest');
      expect(started.status).toBe(201);
      expect(field(started.body, 'user.isGuest')).toBe(true);
      const cookie = ((started.headers['set-cookie'] as string[] | undefined) ?? [])[0] ?? '';
      expect(cookie).toMatch(/HttpOnly/);
      return {
        token: str(started.body, 'accessToken'),
        idUser: num(started.body, 'user.idUser'),
        cookie,
      };
    };
    const guest = await startGuest();

    // Una cuenta de invitado no pide productos por encargo ni personalización; un visitante con token tampoco
    const tooCustom = await as(
      guest.token,
      api().put(`/api/v1/cart/items/${idCustomVariant}`),
    ).send({
      quantity: 1,
    });
    expect(tooCustom.status).toBe(422);
    expect(str(tooCustom.body, 'error.code')).toBe('ACCOUNT_REQUIRED');
    const personalised = await as(guest.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({
      quantity: 1,
      inscription: 'Happy birthday',
    });
    expect(personalised.status).toBe(422);
    expect(str(personalised.body, 'error.code')).toBe('ACCOUNT_REQUIRED');
    const visitor = await api()
      .put(`/api/v1/cart/items/${idCustomVariant}`)
      .set('X-Cart-Token', '11111111-1111-4111-8111-111111111111')
      .send({ quantity: 1 });
    expect(visitor.status).toBe(422);
    expect(str(visitor.body, 'error.code')).toBe('ACCOUNT_REQUIRED');

    // Un producto del mismo día sí; el cupón no: es de las cuentas registradas
    const cart = await as(guest.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({
      quantity: 2,
    });
    expect(cart.status).toBe(200);
    const refusedCoupon = await post(guest.token, '/cart/coupon', { code: couponCode });
    expect(refusedCoupon.status).toBe(422);
    expect(str(refusedCoupon.body, 'error.code')).toBe('ACCOUNT_REQUIRED');
    expect(str((await get(guest.token, '/cart')).body, 'discount')).toBe('0.00');

    // Sin correo de contacto no se crea el pedido
    const address = await post(guest.token, '/addresses', {
      label: 'Home',
      recipient: 'Guest Buyer',
      phone: '55550000',
      line1: '5th Avenue 10-20',
      municipality: 'Guatemala',
      department: 'Guatemala',
    });
    expect(address.status).toBe(201);
    const started = await post(guest.token, '/checkout/start');
    expect(started.status).toBe(201);
    const confirmBody = {
      idReservation: num(started.body, 'idReservation'),
      idAddress: num(address.body, 'idAddress'),
      deliveryDate,
      method: 'BANK_DEPOSIT',
      idBankAccount,
    };
    const withoutContact = await post(guest.token, '/checkout/confirm', confirmBody);
    expect(withoutContact.status).toBe(422);
    expect(str(withoutContact.body, 'error.code')).toBe('GUEST_CONTACT_REQUIRED');

    // El correo de una cuenta registrada no sirve de contacto: esa persona debe iniciar sesión
    const guestEmail = `it-guest-${runId}@shopcart.test`;
    const taken = await as(guest.token, api().put('/api/v1/auth/guest/contact')).send({
      email: `it-ana-${runId}@shopcart.test`,
      fullName: 'Impostor',
    });
    expect(taken.status).toBe(409);
    expect(str(taken.body, 'error.code')).toBe('EMAIL_BELONGS_TO_ACCOUNT');
    const contact = await as(guest.token, api().put('/api/v1/auth/guest/contact')).send({
      email: guestEmail,
      fullName: 'Guest Buyer',
      phone: '55551234',
    });
    expect(contact.status).toBe(200);
    expect(str(contact.body, 'email')).toBe(guestEmail);

    const confirmed = await post(guest.token, '/checkout/confirm', confirmBody);
    expect(confirmed.status).toBe(201);
    const idOrder = num(confirmed.body, 'idOrder');
    const order = await get(guest.token, `/orders/${idOrder}`);
    expect(order.status).toBe(200);
    expect(str(order.body, 'discount')).toBe('0.00');
    expect(str(order.body, 'total')).toBe('200.00');
    // Es del invitado y de nadie más
    expect((await get(customerA.token, `/orders/${idOrder}`)).status).toBe(404);
    expect((await get(customerB.token, `/orders/${idOrder}/payment`)).status).toBe(404);

    // Un invitado nunca inicia sesión por correo y contraseña; quien se registra después con ese correo no queda bloqueado
    const guestLogin = await api().post('/api/v1/auth/login').send({ email: guestEmail, password });
    expect(guestLogin.status).toBe(401);
    const registered = await api()
      .post('/api/v1/auth/register')
      .send({ email: guestEmail, password, fullName: 'Guest Buyer' });
    expect(registered.status).toBe(201);
    const accountLogin = await api()
      .post('/api/v1/auth/login')
      .send({ email: guestEmail, password });
    expect(accountLogin.status).toBe(200);
    expect(field(accountLogin.body, 'user.isGuest')).toBe(false);
  });

  it('lets the administrator manage the branches and a customer pick an order up in one, with the date set by the system', async () => {
    const branch = {
      name: `Branch ${runId}`,
      line1: '6th Avenue 10-20',
      municipality: 'Guatemala',
      department: 'Guatemala',
      openingHours: 'Monday to Friday 8:00 to 18:00',
    };
    // Solo un administrador mantiene las sucursales
    expect((await post(customerA.token, '/admin/branches', branch)).status).toBe(403);
    expect((await get(operator, '/admin/branches')).status).toBe(403);
    const created = await post(administrator, '/admin/branches', branch);
    expect(created.status).toBe(201);
    const idBranch = num(created.body, 'idBranch');
    // Dos sucursales activas no comparten nombre
    expect((await post(administrator, '/admin/branches', branch)).status).toBe(409);

    // Las activas se ven sin cuenta
    const publicList = await api().get('/api/v1/branches');
    expect(publicList.status).toBe(200);
    expect(JSON.stringify(publicList.body)).toContain(branch.name);

    // La fecha ya no se elige: el sistema la estima y el depósito está disponible para ella
    const cart = await as(customerA.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({
      quantity: 1,
    });
    expect(cart.status).toBe(200);
    const methods = await get(customerA.token, '/checkout/payment-methods');
    expect(methods.status).toBe(200);
    expect(str(methods.body, 'estimatedDeliveryDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(
      list(methods.body, 'methods').find((offer) => offer['code'] === 'BANK_DEPOSIT')?.[
        'available'
      ],
    ).toBe(true);

    const started = await post(customerA.token, '/checkout/start');
    expect(started.status).toBe(201);
    const idReservation = num(started.body, 'idReservation');
    // Una recogida no lleva dirección
    const mixed = await post(customerA.token, '/checkout/confirm', {
      idReservation,
      fulfilmentType: 'Pickup',
      idBranch,
      idAddress: customerA.idAddress,
      method: 'BANK_DEPOSIT',
      idBankAccount,
    });
    expect(mixed.status).toBe(400);
    const confirmed = await post(customerA.token, '/checkout/confirm', {
      idReservation,
      fulfilmentType: 'Pickup',
      idBranch,
      method: 'BANK_DEPOSIT',
      idBankAccount,
    });
    expect(confirmed.status).toBe(201);
    const idOrder = num(confirmed.body, 'idOrder');

    // El pedido guarda la sucursal y ninguna dirección; otro cliente no lo ve
    const order = await get(customerA.token, `/orders/${idOrder}`);
    expect(str(order.body, 'fulfilmentType')).toBe('Pickup');
    expect(str(order.body, 'pickupBranchName')).toBe(branch.name);
    expect(field(order.body, 'deliveryLine1')).toBeNull();
    expect(str(order.body, 'requestedDeliveryDate')).toBe(
      str(methods.body, 'estimatedDeliveryDate'),
    );
    expect((await get(customerB.token, `/orders/${idOrder}`)).status).toBe(404);

    // Con un pedido esperando no se puede cerrar la sucursal
    const blocked = await as(administrator, api().delete(`/api/v1/admin/branches/${idBranch}`));
    expect(blocked.status).toBe(422);
    expect(str(blocked.body, 'error.code')).toBe('BRANCH_HAS_OPEN_ORDERS');

    // Al cancelarse el pedido sí: se desactiva, deja de ofrecerse y la administración la sigue viendo
    const cancelled = await post(customerA.token, `/orders/${idOrder}/cancel`, {});
    expect(cancelled.status).toBe(200);
    const removed = await as(administrator, api().delete(`/api/v1/admin/branches/${idBranch}`));
    expect(removed.status).toBe(200);
    expect(field(removed.body, 'isActive')).toBe(false);
    expect(JSON.stringify((await api().get('/api/v1/branches')).body)).not.toContain(branch.name);
    expect(JSON.stringify((await get(administrator, '/admin/branches')).body)).toContain(
      branch.name,
    );
    // Una sucursal desactivada ya no se puede editar
    const edited = await as(administrator, api().put(`/api/v1/admin/branches/${idBranch}`)).send(
      branch,
    );
    expect(edited.status).toBe(422);
    expect(str(edited.body, 'error.code')).toBe('BRANCH_INACTIVE');
  });

  it('lets the administrator manage the payment methods, keeps the cash for pickups and lets an operator confirm it', async () => {
    const title = `Cash ${runId}`;
    const method = {
      kind: 'Cash',
      title,
      description: 'Pay at the branch',
      appliesToDelivery: true,
      appliesToPickup: true,
    };
    // Solo un administrador mantiene los métodos de pago
    expect((await post(customerA.token, '/admin/payment-methods', method)).status).toBe(403);
    expect((await get(operator, '/admin/payment-methods')).status).toBe(403);
    expect(
      (await post(administrator, '/admin/payment-methods', { ...method, kind: 'Card' })).status,
    ).toBe(400);
    const created = await post(administrator, '/admin/payment-methods', method);
    expect(created.status).toBe(201);
    const idCash = num(created.body, 'idPaymentMethod');
    expect((await post(administrator, '/admin/payment-methods', method)).status).toBe(409);
    // El efectivo se guarda solo para recogidas, aunque se haya pedido también para entregas
    const managed = (await get(administrator, '/admin/payment-methods')).body as Json[];
    const stored = managed.find((row) => row['idPaymentMethod'] === idCash);
    expect(stored?.['appliesToDelivery']).toBe(false);
    expect(stored?.['appliesToPickup']).toBe(true);
    // La tarjeta no se administra aquí
    expect(managed.some((row) => row['kind'] === 'Card')).toBe(false);

    // Las cuentas se ven (no se eligen) para quien paga
    expect((await get(customerA.token, '/bank-accounts')).status).toBe(200);
    expect((await api().get('/api/v1/bank-accounts')).status).toBe(401);

    // Un cliente con carrito: para una entrega no hay efectivo; para una recogida sí
    const cart = await as(customerA.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({
      quantity: 1,
    });
    expect(cart.status).toBe(200);
    const forDelivery = await get(customerA.token, '/checkout/payment-methods?fulfilment=Delivery');
    expect(JSON.stringify(forDelivery.body)).not.toContain(title);
    const forPickup = await get(customerA.token, '/checkout/payment-methods?fulfilment=Pickup');
    expect(JSON.stringify(forPickup.body)).toContain(title);

    const branch = await post(administrator, '/admin/branches', {
      name: `Cash branch ${runId}`,
      line1: '6th Avenue 10-20',
      municipality: 'Guatemala',
      department: 'Guatemala',
    });
    const idBranch = num(branch.body, 'idBranch');
    const started = await post(customerA.token, '/checkout/start');
    expect(started.status).toBe(201);
    const idReservation = num(started.body, 'idReservation');

    // El efectivo no se acepta para una entrega a domicilio
    const delivery = await post(customerA.token, '/checkout/confirm', {
      idReservation,
      idAddress: customerA.idAddress,
      idPaymentMethod: idCash,
    });
    expect(delivery.status).toBe(422);
    expect(str(delivery.body, 'error.code')).toBe('PAYMENT_METHOD_UNAVAILABLE');

    const confirmed = await post(customerA.token, '/checkout/confirm', {
      idReservation,
      fulfilmentType: 'Pickup',
      idBranch,
      idPaymentMethod: idCash,
    });
    expect(confirmed.status).toBe(201);
    const idOrder = num(confirmed.body, 'idOrder');
    const idPayment = num(confirmed.body, 'idPayment');

    // El pago queda pendiente, es de efectivo y no admite comprobante
    const payments = (await get(customerA.token, `/orders/${idOrder}/payment`)).body as Json[];
    expect(payments[0]?.['methodKind']).toBe('Cash');
    expect(payments[0]?.['statusName']).toBe('Pending');
    const proof = await uploadProof(customerA.token, idOrder, `CASH-${runId}`, '1.00');
    expect(proof.status).toBe(422);

    // Quien atiende lo encuentra en la lista de cobros en efectivo, por su número de pedido; el cliente no la ve
    expect((await get(customerA.token, '/admin/payments/cash')).status).toBe(403);
    const pendingCash = await get(operator, '/admin/payments/cash');
    expect(list(pendingCash.body, 'items').map((row) => row['idPayment'])).toContain(idPayment);
    const orderNumber = str((await get(customerA.token, `/orders/${idOrder}`)).body, 'orderNumber');
    const found = await get(operator, `/admin/payments/cash?search=${orderNumber}`);
    expect(list(found.body, 'items').map((row) => row['idPayment'])).toEqual([idPayment]);

    // Lo confirma quien atiende, no el cliente; confirmar dos veces no cambia nada
    expect(
      (await post(customerA.token, `/admin/payments/${idPayment}/confirm-cash`, {})).status,
    ).toBe(403);
    const paid = await post(operator, `/admin/payments/${idPayment}/confirm-cash`, {});
    expect(paid.status).toBe(200);
    expect(str(paid.body, 'outcome')).toBe('Approved');
    expect(str((await get(customerA.token, `/orders/${idOrder}`)).body, 'statusName')).toBe('Paid');
    const again = await post(operator, `/admin/payments/${idPayment}/confirm-cash`, {});
    expect(str(again.body, 'outcome')).toBe('AlreadyApproved');
    // Un depósito no es un pago en efectivo
    expect((await post(operator, `/admin/payments/999999/confirm-cash`, {})).status).toBe(404);

    // Quitar el método deja de ofrecerlo; reactivarlo lo devuelve
    const removed = await as(
      administrator,
      api().delete(`/api/v1/admin/payment-methods/${idCash}`),
    );
    expect(removed.status).toBe(200);
    await as(customerB.token, api().put(`/api/v1/cart/items/${idVariant}`)).send({ quantity: 1 });
    expect(
      JSON.stringify(
        (await get(customerB.token, '/checkout/payment-methods?fulfilment=Pickup')).body,
      ),
    ).not.toContain(title);
    const reactivated = await as(
      administrator,
      api().put(`/api/v1/admin/payment-methods/${idCash}`),
    ).send({
      title,
      description: 'Pay at the branch',
      appliesToDelivery: false,
      appliesToPickup: true,
      isActive: true,
    });
    expect(reactivated.status).toBe(200);
    expect(
      JSON.stringify(
        (await get(customerB.token, '/checkout/payment-methods?fulfilment=Pickup')).body,
      ),
    ).toContain(title);
    await as(customerB.token, api().delete(`/api/v1/cart/items/${idVariant}`));
  });

  it('lets anyone follow an order with its number and email, and nobody else', async () => {
    // Un pedido de verdad: el de depósito de siempre
    const { idOrder } = await placeOrder(customerB, 1);
    const detail = await get(customerB.token, `/orders/${idOrder}`);
    const orderNumber = str(detail.body, 'orderNumber');
    const email = str(detail.body, 'customerEmail');

    // Sin sesión, con el número y el correo: solo el estado, las fechas y el historial
    const tracked = await api().get('/api/v1/orders/track').query({ orderNumber, email });
    expect(tracked.status).toBe(200);
    expect(str(tracked.body, 'statusName')).toBe('PendingPayment');
    // Sin comprobante el pago sigue pendiente; con uno enviado pasa a revisión y el historial lo cuenta
    expect(str(tracked.body, 'paymentStatusName')).toBe('Pending');
    expect(list(tracked.body, 'history')).toHaveLength(1);
    expect(JSON.stringify(tracked.body)).not.toContain('deliveryLine1');
    expect(JSON.stringify(tracked.body)).not.toContain(email);
    // El número y el correo se aceptan sin importar mayúsculas
    const loose = await api()
      .get('/api/v1/orders/track')
      .query({ orderNumber: orderNumber.toLowerCase(), email: email.toUpperCase() });
    expect(loose.status).toBe(200);

    // Con el comprobante enviado, el pedido sigue pendiente de pago pero el pago ya está por verificarse, y el historial lo cuenta
    const proof = await uploadProof(
      customerB.token,
      idOrder,
      `TRACK-${runId}`,
      str(detail.body, 'total'),
      png(77),
    );
    expect(proof.status).toBe(201);
    const verifying = await api().get('/api/v1/orders/track').query({ orderNumber, email });
    expect(str(verifying.body, 'statusName')).toBe('PendingPayment');
    expect(str(verifying.body, 'paymentStatusName')).toBe('UnderReview');
    expect(JSON.stringify(list(verifying.body, 'history'))).toContain('PaymentUnderReview');

    // Otro correo o un número que no existe responden igual: no se puede adivinar cuáles hay
    const wrong = await api()
      .get('/api/v1/orders/track')
      .query({ orderNumber, email: 'otra-persona@shopcart.test' });
    const missing = await api()
      .get('/api/v1/orders/track')
      .query({ orderNumber: 'PED-2000-999999', email });
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    // Cambia solo el identificador de la solicitud: el código y el mensaje son los mismos
    expect(str(wrong.body, 'error.code')).toBe(str(missing.body, 'error.code'));
    expect(str(wrong.body, 'error.message')).toBe(str(missing.body, 'error.message'));
    expect((await api().get('/api/v1/orders/track').query({ orderNumber })).status).toBe(400);
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
