// Prueba de concurrencia real de la reserva de stock contra SQL Server: decenas de conexiones llaman a
// SP_Inventory_ReserveStock a la vez. tSQLt no puede hacerlo porque ejecuta cada prueba dentro de una sola transacción.
// Requiere la base de pruebas ya migrada (npm run db:migrate). No instala nada y deja la base como la encontró.
// Códigos de salida: 0 todas las garantías se cumplen, 1 alguna falla, 2 error de la herramienta.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

import { inSequence } from '../../runner/src/sequence.js';
import { retryOnDeadlock, tally, type Outcome, type Tally } from './lib/concurrency.js';
import { loadConfig } from './lib/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MAX_CONNECTIONS = 110;
const EMAIL_PATTERN = 'race-%@shopcart.test';
const SKU_PATTERN = 'RACE-%';
const CATEGORY_NAME = 'Concurrency fixture';

interface Cart {
  IDUser: number;
  IDCart: number;
}

interface CartLine {
  IDCart: number;
  IDVariant: number;
  Quantity: number;
}

const failures: string[] = [];

// Administrador de la prueba: el stock entra por SP_Inventory_RegisterEntry, igual que en producción
let adminId = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  // Sin plantillas anidadas: lo esperado solo se muestra cuando la comprobación falla
  const detail = ok ? '' : ' (expected ' + String(expected) + ')';
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${String(actual)}${detail}`);
  if (!ok) failures.push(name);
}

// Todo se ejecuta con sa sobre la base de pruebas: los datos de la prueba se identifican por su prefijo y se borran al terminar
// El libro de inventario y la bitácora son de solo inserción (triggers de inmutabilidad): solo durante el borrado, y solo en
// la base de pruebas _CI, se desactivan para no dejar movimientos de la prueba que descuadrarían otras pruebas
async function cleanUp(pool: sql.ConnectionPool): Promise<void> {
  await pool
    .request()
    .input('email', sql.NVarChar(256), EMAIL_PATTERN)
    .input('sku', sql.NVarChar(40), SKU_PATTERN)
    .input('category', sql.NVarChar(80), CATEGORY_NAME).batch(`
    DISABLE TRIGGER dbo.TR_InventoryMovements_Immutable ON dbo.InventoryMovements;
    DISABLE TRIGGER dbo.TR_AuditLog_Immutable ON dbo.AuditLog;
    DISABLE TRIGGER dbo.TR_OrderStatusHistory_Immutable ON dbo.OrderStatusHistory;
    DISABLE TRIGGER dbo.TR_PaymentStatusHistory_Immutable ON dbo.PaymentStatusHistory;
    DISABLE TRIGGER dbo.TR_FinancialMovements_Immutable ON dbo.FinancialMovements;
    BEGIN TRY
      DELETE m FROM dbo.InventoryMovements AS m JOIN dbo.Variants AS v ON v.IDVariant = m.IDVariant WHERE v.SKU LIKE @sku;
      DELETE a FROM dbo.AuditLog AS a JOIN dbo.Variants AS v ON a.Module = N'Stock' AND a.EntityKey = CAST(v.IDVariant AS NVARCHAR(40)) WHERE v.SKU LIKE @sku;
      DELETE rl FROM dbo.ReservationLines AS rl JOIN dbo.Variants AS v ON v.IDVariant = rl.IDVariant WHERE v.SKU LIKE @sku;
      DELETE r FROM dbo.Reservations AS r JOIN dbo.Users AS u ON u.IDUser = r.IDUser WHERE u.Email LIKE @email;
      DELETE a FROM dbo.AuditLog AS a JOIN dbo.Orders AS o ON a.Module = N'Orders' AND a.EntityKey = CAST(o.IDOrder AS NVARCHAR(40)) JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE a FROM dbo.AuditLog AS a JOIN dbo.Payments AS p ON a.Module = N'Payments' AND a.EntityKey = CAST(p.IDPayment AS NVARCHAR(40)) JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE pr FROM dbo.PaymentProofs AS pr JOIN dbo.Payments AS p ON p.IDPayment = pr.IDPayment JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE f FROM dbo.FinancialMovements AS f JOIN dbo.Orders AS o ON o.IDOrder = f.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE a FROM dbo.AuditLog AS a JOIN dbo.Refunds AS rf ON a.Module = N'Payments' AND a.EntityName = N'Refund' AND a.EntityKey = CAST(rf.IDRefund AS NVARCHAR(40)) JOIN dbo.Payments AS p ON p.IDPayment = rf.IDPayment JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE a FROM dbo.AuditLog AS a JOIN dbo.Returns AS rt ON a.Module = N'Orders' AND a.EntityName = N'Return' AND a.EntityKey = CAST(rt.IDReturn AS NVARCHAR(40)) JOIN dbo.Orders AS o ON o.IDOrder = rt.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE rf FROM dbo.Refunds AS rf JOIN dbo.Payments AS p ON p.IDPayment = rf.IDPayment JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE rl FROM dbo.ReturnLines AS rl JOIN dbo.Returns AS rt ON rt.IDReturn = rl.IDReturn JOIN dbo.Orders AS o ON o.IDOrder = rt.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE rt FROM dbo.Returns AS rt JOIN dbo.Orders AS o ON o.IDOrder = rt.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE h FROM dbo.PaymentStatusHistory AS h JOIN dbo.Payments AS p ON p.IDPayment = h.IDPayment JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE h FROM dbo.OrderStatusHistory AS h JOIN dbo.Orders AS o ON o.IDOrder = h.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE d FROM dbo.PaymentDeposits AS d JOIN dbo.Payments AS p ON p.IDPayment = d.IDPayment JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE p FROM dbo.Payments AS p JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE cu FROM dbo.CouponUsages AS cu JOIN dbo.Users AS u ON u.IDUser = cu.IDUser WHERE u.Email LIKE @email;
      DELETE l FROM dbo.OrderLines AS l JOIN dbo.Orders AS o ON o.IDOrder = l.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
      DELETE o FROM dbo.Orders AS o JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE @email;
    END TRY
    BEGIN CATCH
      ENABLE TRIGGER dbo.TR_InventoryMovements_Immutable ON dbo.InventoryMovements;
      ENABLE TRIGGER dbo.TR_AuditLog_Immutable ON dbo.AuditLog;
      ENABLE TRIGGER dbo.TR_OrderStatusHistory_Immutable ON dbo.OrderStatusHistory;
      ENABLE TRIGGER dbo.TR_PaymentStatusHistory_Immutable ON dbo.PaymentStatusHistory;
      ENABLE TRIGGER dbo.TR_FinancialMovements_Immutable ON dbo.FinancialMovements;
      THROW;
    END CATCH;
    ENABLE TRIGGER dbo.TR_InventoryMovements_Immutable ON dbo.InventoryMovements;
    ENABLE TRIGGER dbo.TR_AuditLog_Immutable ON dbo.AuditLog;
    ENABLE TRIGGER dbo.TR_OrderStatusHistory_Immutable ON dbo.OrderStatusHistory;
    ENABLE TRIGGER dbo.TR_PaymentStatusHistory_Immutable ON dbo.PaymentStatusHistory;
    ENABLE TRIGGER dbo.TR_FinancialMovements_Immutable ON dbo.FinancialMovements;
    DELETE FROM dbo.BankAccounts WHERE BankName = N'RACE Bank';

    DELETE ad FROM dbo.Addresses AS ad JOIN dbo.Users AS u ON u.IDUser = ad.IDUser WHERE u.Email LIKE @email;
    DELETE ci FROM dbo.CartItems AS ci JOIN dbo.Carts AS c ON c.IDCart = ci.IDCart JOIN dbo.Users AS u ON u.IDUser = c.IDUser WHERE u.Email LIKE @email;
    DELETE c FROM dbo.Carts AS c JOIN dbo.Users AS u ON u.IDUser = c.IDUser WHERE u.Email LIKE @email;
    DELETE FROM dbo.Coupons WHERE Code LIKE N'RACE-%';
    DELETE FROM dbo.Variants WHERE SKU LIKE @sku;
    DELETE p FROM dbo.Products AS p JOIN dbo.Categories AS cat ON cat.IDCategory = p.IDCategory WHERE cat.Name = @category;
    DELETE FROM dbo.Categories WHERE Name = @category;
    DELETE FROM dbo.Users WHERE Email LIKE @email;
    DELETE FROM dbo.IdempotentRequests WHERE Scope LIKE N'G:race-%';
  `);
}

async function createVariants(
  pool: sql.ConnectionPool,
  tag: string,
  stocks: readonly number[],
): Promise<number[]> {
  await pool.request().input('category', sql.NVarChar(80), CATEGORY_NAME).batch(`
    IF NOT EXISTS (SELECT 1 FROM dbo.Categories WHERE Name = @category) INSERT INTO dbo.Categories (Name) VALUES (@category);
  `);
  const ids = await Promise.all(
    stocks.map(async (stock, index) => {
      const result = await pool
        .request()
        .input('category', sql.NVarChar(80), CATEGORY_NAME)
        .input('product', sql.NVarChar(150), `Concurrency ${tag} ${index}`)
        .input('sku', sql.NVarChar(40), `RACE-${tag}-${index}`).query<{ IDVariant: number }>(`
        INSERT INTO dbo.Products (IDCategory, Name) SELECT IDCategory, @product FROM dbo.Categories WHERE Name = @category;
        INSERT INTO dbo.Variants (IDProduct, SKU, Price)
        OUTPUT inserted.IDVariant
        SELECT IDProduct, @sku, 10.00 FROM dbo.Products WHERE Name = @product;
      `);
      const idVariant = result.recordset[0]?.IDVariant ?? 0;
      if (stock > 0) await registerEntry(pool, idVariant, stock);
      return idVariant;
    }),
  );
  return ids;
}

async function registerEntry(
  pool: sql.ConnectionPool,
  variant: number,
  quantity: number,
): Promise<Outcome> {
  return retryOnDeadlock(async () => {
    await pool
      .request()
      .input('IDActor', sql.Int, adminId)
      .input('IDVariant', sql.Int, variant)
      .input('Quantity', sql.Int, quantity)
      .input('Reason', sql.NVarChar(250), 'Concurrency check')
      .output('IDMovement', sql.BigInt)
      .execute('dbo.SP_Inventory_RegisterEntry');
  });
}

async function createAdmin(pool: sql.ConnectionPool): Promise<void> {
  const result = await pool.request().query<{ IDUser: number }>(`
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    OUTPUT inserted.IDUser
    VALUES (3, N'race-admin@shopcart.test', N'not-a-real-hash', N'Concurrency admin');
  `);
  adminId = result.recordset[0]?.IDUser ?? 0;
}

async function createCarts(pool: sql.ConnectionPool, tag: string, count: number): Promise<Cart[]> {
  const result = await pool
    .request()
    .input('prefix', sql.NVarChar(40), `race-${tag}-`)
    .input('count', sql.Int, count).query<Cart>(`
    INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
    SELECT 1, CONCAT(@prefix, n.value, N'@shopcart.test'), N'not-a-real-hash', CONCAT(N'Concurrency ', n.value)
    FROM GENERATE_SERIES(1, @count) AS n;

    INSERT INTO dbo.Carts (IDUser, Status)
    SELECT IDUser, N'Active' FROM dbo.Users WHERE Email LIKE CONCAT(@prefix, N'%');

    SELECT u.IDUser, c.IDCart
    FROM dbo.Users AS u JOIN dbo.Carts AS c ON c.IDUser = u.IDUser
    WHERE u.Email LIKE CONCAT(@prefix, N'%')
    ORDER BY c.IDCart;
  `);
  return result.recordset;
}

async function addLines(pool: sql.ConnectionPool, lines: readonly CartLine[]): Promise<void> {
  await pool.request().input('lines', sql.NVarChar(sql.MAX), JSON.stringify(lines)).batch(`
    INSERT INTO dbo.CartItems (IDCart, IDVariant, Quantity)
    SELECT IDCart, IDVariant, Quantity
    FROM OPENJSON(@lines) WITH (IDCart INT, IDVariant INT, Quantity INT);
  `);
}

async function reserve(pool: sql.ConnectionPool, cart: Cart): Promise<Outcome> {
  return retryOnDeadlock(async () => {
    await pool
      .request()
      .input('IDUser', sql.Int, cart.IDUser)
      .input('IDCart', sql.Int, cart.IDCart)
      .output('IDReservation', sql.Int)
      .execute('dbo.SP_Inventory_ReserveStock');
  });
}

// Misma invariante que protege el diseño: el contador de cada variante es exactamente la suma de sus reservas activas
async function checkInvariant(
  pool: sql.ConnectionPool,
  label: string,
  variants: readonly number[],
): Promise<void> {
  const rows = await pool.request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(variants))
    .query<{
    IDVariant: number;
    OnHandStock: number;
    ReservedStock: number;
    Held: number;
  }>(`
    SELECT v.IDVariant, v.OnHandStock, v.ReservedStock,
           Held = ISNULL((SELECT SUM(rl.Quantity) FROM dbo.ReservationLines AS rl
                          JOIN dbo.Reservations AS r ON r.IDReservation = rl.IDReservation AND r.Status = N'Active'
                          WHERE rl.IDVariant = v.IDVariant), 0)
    FROM dbo.Variants AS v WHERE v.IDVariant IN (SELECT value FROM OPENJSON(@ids));
  `);
  rows.recordset.forEach((row, index) => {
    check(
      `${label} · variant ${index + 1}: counter equals the active reservations`,
      row.ReservedStock,
      row.Held,
    );
    check(
      `${label} · variant ${index + 1}: never above the physical stock`,
      row.ReservedStock <= row.OnHandStock,
      true,
    );
  });
  await checkReconciliation(pool, label, variants);
}

// El contrato del diseño: la vista de conciliación devuelve cero filas
async function checkReconciliation(
  pool: sql.ConnectionPool,
  label: string,
  variants: readonly number[],
): Promise<void> {
  const result = await pool
    .request()
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(variants))
    .query<{ Differences: number }>(
      'SELECT Differences = COUNT(*) FROM dbo.VW_Inventory_Reconciliation WHERE IDVariant IN (SELECT value FROM OPENJSON(@ids));',
    );
  check(`${label}: the reconciliation view returns no rows`, result.recordset[0]?.Differences, 0);
}

async function reservedStock(pool: sql.ConnectionPool, variant: number): Promise<number> {
  const result = await pool
    .request()
    .input('id', sql.Int, variant)
    .query<{ ReservedStock: number }>(
      'SELECT ReservedStock FROM dbo.Variants WHERE IDVariant = @id;',
    );
  return result.recordset[0]?.ReservedStock ?? -1;
}

function report(counts: Tally): string {
  return `reserved ${counts.reserved}, conflict ${counts.conflict}, deadlock ${counts.deadlock}, other ${counts.other}`;
}

// 100 clientes, cada uno con su carrito de 1 unidad, compiten por `stock` unidades
async function race(
  pool: sql.ConnectionPool,
  tag: string,
  buyers: number,
  stock: number,
): Promise<void> {
  console.log(`\n${buyers} buyers compete for ${stock} unit(s)`);
  const [variant = 0] = await createVariants(pool, tag, [stock]);
  const carts = await createCarts(pool, tag, buyers);
  await addLines(
    pool,
    carts.map((cart) => ({ IDCart: cart.IDCart, IDVariant: variant, Quantity: 1 })),
  );

  const counts = tally(await Promise.all(carts.map((cart) => reserve(pool, cart))));
  console.log(`  ${report(counts)}`);
  check('exactly the available units are reserved', counts.reserved, stock);
  check('everyone else gets the stock conflict', counts.conflict, buyers - stock);
  check('no other failure', counts.other + counts.deadlock, 0);
  check('the counter holds exactly the stock', await reservedStock(pool, variant), stock);
  await checkInvariant(pool, 'race', [variant]);
}

// Doble clic: veinte solicitudes del mismo carrito a la vez no pueden retener las unidades más de una vez
async function doubleClick(pool: sql.ConnectionPool): Promise<void> {
  console.log('\n20 simultaneous requests for the same cart');
  const [variant = 0] = await createVariants(pool, 'dbl', [100]);
  const [cart] = await createCarts(pool, 'dbl', 1);
  if (cart === undefined) throw new Error('The cart was not created.');
  await addLines(pool, [{ IDCart: cart.IDCart, IDVariant: variant, Quantity: 2 }]);

  const counts = tally(await Promise.all(Array.from({ length: 20 }, () => reserve(pool, cart))));
  console.log(`  ${report(counts)}`);
  check('every request succeeds', counts.reserved, 20);
  const active = await pool
    .request()
    .input('cart', sql.Int, cart.IDCart)
    .query<{ Active: number }>(
      "SELECT Active = COUNT(*) FROM dbo.Reservations WHERE IDCart = @cart AND Status = N'Active';",
    );
  check('only one active reservation remains', active.recordset[0]?.Active, 1);
  check('the units are held once', await reservedStock(pool, variant), 2);
  await checkInvariant(pool, 'double click', [variant]);
}

// Un carrito con una línea sin stock no puede dejar apartada la otra
async function allOrNothing(pool: sql.ConnectionPool): Promise<void> {
  console.log('\nA cart with one unavailable line reserves nothing');
  const [available = 0, soldOut = 0] = await createVariants(pool, 'aon', [5, 0]);
  const [cart] = await createCarts(pool, 'aon', 1);
  if (cart === undefined) throw new Error('The cart was not created.');
  await addLines(pool, [
    { IDCart: cart.IDCart, IDVariant: available, Quantity: 1 },
    { IDCart: cart.IDCart, IDVariant: soldOut, Quantity: 1 },
  ]);

  check('the call is refused as a conflict', await reserve(pool, cart), 'conflict');
  check('the available line was not held', await reservedStock(pool, available), 0);
  await checkInvariant(pool, 'all or nothing', [available, soldOut]);
}

// Carritos con las mismas tres variantes en distinto orden: provoca el patrón clásico de deadlock
async function crossingCarts(pool: sql.ConnectionPool): Promise<void> {
  const buyers = 60;
  const stock = 40;
  console.log(
    `\n${buyers} carts with the same three variants in different order, ${stock} units each`,
  );
  const variants = await createVariants(pool, 'crs', [stock, stock, stock]);
  const carts = await createCarts(pool, 'crs', buyers);
  const lines = carts.flatMap((cart, index) =>
    variants.map((_, position) => ({
      IDCart: cart.IDCart,
      IDVariant: variants[(position + index) % variants.length] ?? 0,
      Quantity: 1,
    })),
  );
  await addLines(pool, lines);

  const counts = tally(await Promise.all(carts.map((cart) => reserve(pool, cart))));
  console.log(`  ${report(counts)}`);
  check('exactly the carts that fit are reserved', counts.reserved, stock);
  check('the rest get the stock conflict', counts.conflict, buyers - stock);
  check('no deadlock survives the retries', counts.deadlock + counts.other, 0);
  await checkInvariant(pool, 'crossing carts', variants);
}

// Cincuenta entradas de una unidad a la vez: ninguna se pierde y el saldo del libro es consecutivo
async function ledgerEntries(pool: sql.ConnectionPool): Promise<void> {
  const entries = 50;
  console.log(`\n${entries} simultaneous entries of one unit`);
  const [variant = 0] = await createVariants(pool, 'led', [0]);

  const counts = tally(
    await Promise.all(Array.from({ length: entries }, () => registerEntry(pool, variant, 1))),
  );
  console.log(`  ${report(counts)}`);
  check('every entry succeeds', counts.reserved, entries);

  const ledger = await pool.request().input('id', sql.Int, variant).query<{
    OnHandStock: number;
    Movements: number;
    Total: number;
    DistinctBalances: number;
    MaxBalance: number;
  }>(`
    SELECT v.OnHandStock,
           Movements = COUNT(m.IDInventoryMovement), Total = ISNULL(SUM(m.Quantity), 0),
           DistinctBalances = COUNT(DISTINCT m.ResultingBalance), MaxBalance = ISNULL(MAX(m.ResultingBalance), 0)
    FROM dbo.Variants AS v LEFT JOIN dbo.InventoryMovements AS m ON m.IDVariant = v.IDVariant
    WHERE v.IDVariant = @id GROUP BY v.OnHandStock;
  `);
  const row = ledger.recordset[0];
  check('the stock holds every unit', row?.OnHandStock, entries);
  check('the ledger has one movement per entry', row?.Movements, entries);
  check('the ledger adds up to the stock', row?.Total, entries);
  check('every resulting balance is different', row?.DistinctBalances, entries);
  check('the last balance is the stock', row?.MaxBalance, entries);
  await checkReconciliation(pool, 'ledger entries', [variant]);
}

interface BeginRow {
  Outcome: string;
  HttpStatus: number | null;
  ResponseBody: string | null;
}

const IDEMPOTENCY_HASH = 'a'.repeat(64);
const IDEMPOTENCY_SCOPE = 'G:race-idempotency';
const IDEMPOTENCY_ROUTE = '/checkout/confirm';

// Un error de la llamada se cuenta como resultado 'Error' y no aborta la prueba: un duplicado que SQL Server rechaza con
// una violación del índice único también significa que dos solicitudes pasaron a la vez
async function beginIdempotent(
  pool: sql.ConnectionPool,
  key: string,
  hash: string,
): Promise<BeginRow> {
  try {
    const result = await pool
      .request()
      .input('Scope', sql.NVarChar(64), IDEMPOTENCY_SCOPE)
      .input('Method', sql.NVarChar(7), 'POST')
      .input('Route', sql.NVarChar(200), IDEMPOTENCY_ROUTE)
      .input('IdempotencyKey', sql.NVarChar(64), key)
      .input('RequestHash', sql.Char(64), hash)
      .execute<BeginRow>('dbo.SP_Idempotency_Begin');
    return result.recordset[0] ?? { Outcome: 'Error', HttpStatus: null, ResponseBody: null };
  } catch {
    return { Outcome: 'Error', HttpStatus: null, ResponseBody: null };
  }
}

function countOutcome(rows: readonly BeginRow[], outcome: string): number {
  return rows.filter((row) => row.Outcome === outcome).length;
}

async function completeIdempotent(pool: sql.ConnectionPool, key: string): Promise<void> {
  await pool
    .request()
    .input('Scope', sql.NVarChar(64), IDEMPOTENCY_SCOPE)
    .input('Method', sql.NVarChar(7), 'POST')
    .input('Route', sql.NVarChar(200), IDEMPOTENCY_ROUTE)
    .input('IdempotencyKey', sql.NVarChar(64), key)
    .input('HttpStatus', sql.SmallInt, 201)
    .input('ResponseBody', sql.NVarChar(sql.MAX), `{"key":"${key}"}`)
    .output('Stored', sql.Bit)
    .execute('dbo.SP_Idempotency_Complete');
}

// Veinte llaves con cinco solicitudes simultáneas cada una (cien conexiones a la vez): por cada llave exactamente una se
// ejecuta y las otras esperan; al completarse, todas reproducen la misma respuesta. Es el INSERT atómico del ADR-0004.
// Varias llaves a la vez, y no una sola, para que las colisiones sean seguras de provocar.
async function idempotencyRace(pool: sql.ConnectionPool): Promise<void> {
  const keys = Array.from({ length: 20 }, (_, index) => `race-key-${index}`);
  const callersPerKey = 5;
  console.log(`\n${keys.length} idempotency keys with ${callersPerKey} simultaneous requests each`);

  const first = await Promise.all(
    keys.flatMap((key) =>
      Array.from({ length: callersPerKey }, () =>
        beginIdempotent(pool, key, IDEMPOTENCY_HASH).then((row) => ({ key, row })),
      ),
    ),
  );
  const rowsOf = (key: string) =>
    first.filter((entry) => entry.key === key).map((entry) => entry.row);
  const executedOnce = keys.filter((key) => countOutcome(rowsOf(key), 'New') === 1).length;
  const waiting = first.filter((entry) => entry.row.Outcome === 'InProgress').length;
  console.log(
    `  keys executed once ${executedOnce} of ${keys.length}, waiting ${waiting}, errors ${countOutcome(
      first.map((e) => e.row),
      'Error',
    )}`,
  );
  check('every key is allowed to execute exactly once', executedOnce, keys.length);
  check(
    'all the other requests are told it is in progress',
    waiting,
    keys.length * (callersPerKey - 1),
  );
  check(
    'no request fails with a duplicate error',
    countOutcome(
      first.map((e) => e.row),
      'Error',
    ),
    0,
  );

  await Promise.all(keys.map((key) => completeIdempotent(pool, key)));

  const replays = await Promise.all(
    keys.flatMap((key) =>
      Array.from({ length: callersPerKey }, () =>
        beginIdempotent(pool, key, IDEMPOTENCY_HASH).then((row) => ({ key, row })),
      ),
    ),
  );
  check(
    'once completed, every retry replays',
    replays.filter((e) => e.row.Outcome === 'Replay').length,
    keys.length * callersPerKey,
  );
  check(
    'every replay carries the exact response stored for its key',
    replays.every((e) => e.row.HttpStatus === 201 && e.row.ResponseBody === `{"key":"${e.key}"}`),
    true,
  );

  const mismatches = await Promise.all(
    keys.map((key) => beginIdempotent(pool, key, 'b'.repeat(64))),
  );
  check(
    'the same key with another body is always a mismatch',
    countOutcome(mismatches, 'Mismatch'),
    keys.length,
  );

  const rows = await pool
    .request()
    .input('Scope', sql.NVarChar(64), IDEMPOTENCY_SCOPE)
    .query<{ Rows: number }>(
      'SELECT Rows = COUNT(*) FROM dbo.IdempotentRequests WHERE Scope = @Scope;',
    );
  check('only one row exists per key', rows.recordset[0]?.Rows, keys.length);
}

interface OrderAttempt {
  outcome: 'created' | 'conflict' | 'other';
  idOrder: number | null;
  idPayment: number | null;
  message: string;
}

async function reserveCart(pool: sql.ConnectionPool, cart: Cart): Promise<number> {
  const result = await pool
    .request()
    .input('IDUser', sql.Int, cart.IDUser)
    .input('IDCart', sql.Int, cart.IDCart)
    .output('IDReservation', sql.Int)
    .execute('dbo.SP_Inventory_ReserveStock');
  return result.output['IDReservation'] as number;
}

async function createAddresses(
  pool: sql.ConnectionPool,
  tag: string,
): Promise<Map<number, number>> {
  const result = await pool.request().input('prefix', sql.NVarChar(40), `race-${tag}-`).query<{
    IDUser: number;
    IDAddress: number;
  }>(`
    INSERT INTO dbo.Addresses (IDUser, Label, Recipient, Phone, Line1, Municipality, Department)
    SELECT IDUser, N'Home', N'Race customer', N'55550000', N'Line 1', N'City', N'State'
    FROM dbo.Users WHERE Email LIKE CONCAT(@prefix, N'%');
    SELECT a.IDUser, a.IDAddress FROM dbo.Addresses AS a JOIN dbo.Users AS u ON u.IDUser = a.IDUser
    WHERE u.Email LIKE CONCAT(@prefix, N'%');
  `);
  return new Map(result.recordset.map((row) => [row.IDUser, row.IDAddress]));
}

// A SQL error is a result, not a crash: the guarantees are about what the database answers under contention
async function placeOrder(
  pool: sql.ConnectionPool,
  cart: Cart,
  reservation: number,
  address: number,
  key: string,
  method = 1,
  bank: number | null = null,
): Promise<OrderAttempt> {
  try {
    const result = await pool
      .request()
      .input('IDUser', sql.Int, cart.IDUser)
      .input('IDReservation', sql.Int, reservation)
      .input('IDAddress', sql.Int, address)
      .input('RequestedDeliveryDate', sql.Date, new Date(Date.UTC(2099, 0, 1)))
      .input('IDPaymentMethod', sql.TinyInt, method)
      .input('IDBankAccount', sql.Int, bank)
      .input('IdempotencyKey', sql.NVarChar(64), key)
      .output('IDOrder', sql.Int)
      .output('IDPayment', sql.Int)
      .output('OrderNumber', sql.NVarChar(20))
      .output('PaymentExpiresAt', sql.DateTime2(3))
      .execute('dbo.SP_Orders_CreateOrder');
    return {
      outcome: 'created',
      idOrder: result.output['IDOrder'] as number,
      idPayment: result.output['IDPayment'] as number,
      message: '',
    };
  } catch (error) {
    const number = (error as { number?: unknown }).number;
    const message = error instanceof Error ? error.message : String(error);
    return {
      outcome: number === 50409 ? 'conflict' : 'other',
      idOrder: null,
      idPayment: null,
      message,
    };
  }
}

async function scalar(pool: sql.ConnectionPool, query: string): Promise<number> {
  const result = await pool.request().query<{ Value: number }>(query);
  return result.recordset[0]?.Value ?? -1;
}

// Doble clic sobre "confirmar compra": diez solicitudes con la misma llave y la misma reserva crean un solo pedido
async function orderDoubleClick(pool: sql.ConnectionPool): Promise<void> {
  console.log('\n10 simultaneous order requests with the same key and reservation');
  const [variant = 0] = await createVariants(pool, 'odc', [10]);
  const [cart] = await createCarts(pool, 'odc', 1);
  if (cart === undefined) throw new Error('The cart was not created.');
  await addLines(pool, [{ IDCart: cart.IDCart, IDVariant: variant, Quantity: 2 }]);
  const addresses = await createAddresses(pool, 'odc');
  const reservation = await reserveCart(pool, cart);

  const attempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      placeOrder(pool, cart, reservation, addresses.get(cart.IDUser) ?? 0, 'race-double-click'),
    ),
  );
  const created = attempts.filter((attempt) => attempt.outcome === 'created');
  console.log(
    `  created ${created.length}, conflict ${attempts.filter((a) => a.outcome === 'conflict').length}, other ${attempts.filter((a) => a.outcome === 'other').length}`,
  );
  check('every request gets an answer', created.length, 10);
  check(
    'all of them are the same order',
    new Set(created.map((attempt) => attempt.idOrder)).size,
    1,
  );
  check(
    'only one order exists',
    await scalar(
      pool,
      "SELECT Value = COUNT(*) FROM dbo.Orders AS o JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE N'race-odc-%';",
    ),
    1,
  );
  check(
    'only one payment exists',
    await scalar(
      pool,
      "SELECT Value = COUNT(*) FROM dbo.Payments AS p JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE N'race-odc-%';",
    ),
    1,
  );
  check('the units stay reserved once', await reservedStock(pool, variant), 2);
  await checkInvariant(pool, 'order double click', [variant]);
}

// Veinte clientes se disputan el último uso de un cupón: exactamente uno se lleva el descuento y los otros pedidos no se crean
async function lastCouponUse(pool: sql.ConnectionPool): Promise<void> {
  const buyers = 20;
  console.log(`\n${buyers} customers compete for the last use of a coupon`);
  await pool
    .request()
    .batch(
      "INSERT INTO dbo.Coupons (Code, Type, Value, MinimumAmount, StartsAt, EndsAt, TotalUsageLimit) VALUES (N'RACE-ONE', N'Percentage', 10.00, 0, '2020-01-01', '2099-12-31', 1);",
    );
  const [variant = 0] = await createVariants(pool, 'cpn', [50]);
  const carts = await createCarts(pool, 'cpn', buyers);
  await addLines(
    pool,
    carts.map((cart) => ({ IDCart: cart.IDCart, IDVariant: variant, Quantity: 1 })),
  );
  const addresses = await createAddresses(pool, 'cpn');
  await pool
    .request()
    .batch(
      "UPDATE c SET IDCoupon = (SELECT IDCoupon FROM dbo.Coupons WHERE Code = N'RACE-ONE') FROM dbo.Carts AS c JOIN dbo.Users AS u ON u.IDUser = c.IDUser WHERE u.Email LIKE N'race-cpn-%';",
    );
  const reservations = await Promise.all(carts.map((cart) => reserveCart(pool, cart)));

  const attempts = await Promise.all(
    carts.map((cart, index) =>
      placeOrder(
        pool,
        cart,
        reservations[index] ?? 0,
        addresses.get(cart.IDUser) ?? 0,
        `race-coupon-${index}`,
      ),
    ),
  );
  const created = attempts.filter((attempt) => attempt.outcome === 'created').length;
  const exhausted = attempts.filter(
    (attempt) => attempt.outcome === 'conflict' && attempt.message.startsWith('COUPON_EXHAUSTED'),
  ).length;
  console.log(
    `  created ${created}, coupon exhausted ${exhausted}, other ${buyers - created - exhausted}`,
  );
  check('exactly one order takes the last use', created, 1);
  check('every other order is refused as exhausted', exhausted, buyers - 1);
  check(
    'the coupon counts exactly one use',
    await scalar(pool, "SELECT Value = UsageCount FROM dbo.Coupons WHERE Code = N'RACE-ONE';"),
    1,
  );
  check(
    'one coupon usage was recorded',
    await scalar(
      pool,
      "SELECT Value = COUNT(*) FROM dbo.CouponUsages AS cu JOIN dbo.Users AS u ON u.IDUser = cu.IDUser WHERE u.Email LIKE N'race-cpn-%';",
    ),
    1,
  );
  check(
    'the winner got the discount',
    await scalar(
      pool,
      "SELECT Value = COUNT(*) FROM dbo.Orders AS o JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE N'race-cpn-%' AND o.Discount = 1.00;",
    ),
    1,
  );
  check(
    'the refused orders left their stock reserved, untouched',
    await reservedStock(pool, variant),
    buyers,
  );
  await checkInvariant(pool, 'last coupon use', [variant]);
}

// Una confirmación de pago llega varias veces a la vez (un webhook reintentado, dos operadores): el pago se aprueba una sola
// vez, el stock baja una sola vez y el libro de dinero cobra una sola vez
async function paymentConfirmRace(pool: sql.ConnectionPool): Promise<void> {
  const confirmations = 20;
  console.log(`\n${confirmations} simultaneous confirmations of the same payment`);
  const [variant = 0] = await createVariants(pool, 'pcf', [30]);
  const [cart] = await createCarts(pool, 'pcf', 1);
  if (cart === undefined) throw new Error('The cart was not created.');
  await addLines(pool, [{ IDCart: cart.IDCart, IDVariant: variant, Quantity: 2 }]);
  const addresses = await createAddresses(pool, 'pcf');
  const reservation = await reserveCart(pool, cart);
  const order = await placeOrder(
    pool,
    cart,
    reservation,
    addresses.get(cart.IDUser) ?? 0,
    'race-confirm',
  );
  const idPayment = order.idPayment ?? 0;

  const outcomes = await Promise.all(
    Array.from({ length: confirmations }, () => confirmPayment(pool, idPayment, '20.00')),
  );
  const approved = outcomes.filter((outcome) => outcome === 'Approved').length;
  const already = outcomes.filter((outcome) => outcome === 'AlreadyApproved').length;
  console.log(
    `  approved ${approved}, already approved ${already}, other ${confirmations - approved - already}`,
  );
  check('exactly one confirmation approves the payment', approved, 1);
  check('all the others are told it was already approved', already, confirmations - 1);
  check(
    'the physical stock dropped once',
    await scalar(
      pool,
      `SELECT Value = OnHandStock FROM dbo.Variants WHERE IDVariant = ${variant};`,
    ),
    28,
  );
  check('the reserved stock was consumed once', await reservedStock(pool, variant), 0);
  check(
    'one exit movement was written',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.InventoryMovements WHERE IDVariant = ${variant} AND IDInventoryMovementType = 2;`,
    ),
    1,
  );
  check(
    'the money ledger charged once',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.FinancialMovements WHERE IDPayment = ${idPayment} AND Type = N'Charge';`,
    ),
    1,
  );
  check(
    'the order is paid',
    await scalar(
      pool,
      `SELECT Value = IDOrderStatus FROM dbo.Orders WHERE IDOrder = ${order.idOrder ?? 0};`,
    ),
    2,
  );
  await checkInvariant(pool, 'payment confirmation', [variant]);
}

// Un operador aprueba mientras otro rechaza el mismo depósito: gana uno, el otro recibe un 422, y el estado final es siempre
// coherente (pagado con la salida de inventario, o pendiente con el stock todavía reservado), nunca una mezcla
async function approveVersusReject(pool: sql.ConnectionPool): Promise<void> {
  const payments = 20;
  console.log(`\n${payments} deposits approved and rejected at the same time`);
  await pool
    .request()
    .batch(
      "IF NOT EXISTS (SELECT 1 FROM dbo.BankAccounts WHERE BankName = N'RACE Bank') INSERT INTO dbo.BankAccounts (BankName, AccountType, AccountNumber, HolderName) VALUES (N'RACE Bank', N'Checking', N'0001', N'Race');",
    );
  const bank = await scalar(
    pool,
    "SELECT Value = IDBankAccount FROM dbo.BankAccounts WHERE BankName = N'RACE Bank';",
  );
  const operator = await createOperator(pool);
  const [variant = 0] = await createVariants(pool, 'avr', [50]);
  const carts = await createCarts(pool, 'avr', payments);
  await addLines(
    pool,
    carts.map((cart) => ({ IDCart: cart.IDCart, IDVariant: variant, Quantity: 1 })),
  );
  const addresses = await createAddresses(pool, 'avr');
  const reservations = await Promise.all(carts.map((cart) => reserveCart(pool, cart)));
  const orders = await Promise.all(
    carts.map((cart, index) =>
      placeOrder(
        pool,
        cart,
        reservations[index] ?? 0,
        addresses.get(cart.IDUser) ?? 0,
        `race-avr-${index}`,
        2,
        bank,
      ),
    ),
  );
  const notCreated = orders.filter((order) => order.outcome !== 'created');
  if (notCreated.length > 0) console.log(`  first order failure: ${notCreated[0]?.message ?? ''}`);
  check('every deposit order was created', payments - notCreated.length, payments);
  await Promise.all(
    carts.map((cart, index) =>
      registerProof(pool, cart.IDUser, orders[index]?.idPayment ?? 0, index),
    ),
  );

  const results = await Promise.all(
    orders.flatMap((order) => [
      reviewDeposit(pool, 'dbo.SP_Payments_ApproveDeposit', operator, order.idPayment ?? 0),
      reviewDeposit(pool, 'dbo.SP_Payments_RejectDeposit', operator, order.idPayment ?? 0),
    ]),
  );
  const unexpected = results.filter((result) => result !== 'ok' && result !== 'refused').length;
  const kinds = [...new Set(results)].map(
    (kind) => `${kind}: ${results.filter((r) => r === kind).length}`,
  );
  console.log(`  results: ${kinds.join(', ')}`);
  const approved = await scalar(
    pool,
    "SELECT Value = COUNT(*) FROM dbo.Payments AS p JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE N'race-avr-%' AND p.IDPaymentStatus = 3;",
  );
  const rejected = await scalar(
    pool,
    "SELECT Value = COUNT(*) FROM dbo.Payments AS p JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE N'race-avr-%' AND p.IDPaymentStatus = 4;",
  );
  console.log(`  approved ${approved}, rejected ${rejected}, unexpected errors ${unexpected}`);
  check('every payment ends approved or rejected, never both', approved + rejected, payments);
  check('no review fails with an unexpected error', unexpected, 0);
  check(
    'each paid order has its exit movement',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.InventoryMovements WHERE IDVariant = ${variant} AND IDInventoryMovementType = 2;`,
    ),
    approved,
  );
  check(
    'the physical stock dropped once per approval',
    await scalar(
      pool,
      `SELECT Value = OnHandStock FROM dbo.Variants WHERE IDVariant = ${variant};`,
    ),
    50 - approved,
  );
  check(
    'only the rejected orders keep their stock reserved',
    await reservedStock(pool, variant),
    payments - approved,
  );
  check(
    'the money ledger has one charge per approval',
    await scalar(
      pool,
      "SELECT Value = COUNT(*) FROM dbo.FinancialMovements AS f JOIN dbo.Orders AS o ON o.IDOrder = f.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE N'race-avr-%' AND f.Type = N'Charge';",
    ),
    approved,
  );
  check(
    'the paid orders are exactly the approved payments',
    await scalar(
      pool,
      "SELECT Value = COUNT(*) FROM dbo.Orders AS o JOIN dbo.Users AS u ON u.IDUser = o.IDUser WHERE u.Email LIKE N'race-avr-%' AND o.IDOrderStatus = 2;",
    ),
    approved,
  );
  await checkInvariant(pool, 'approve versus reject', [variant]);
}

// Pedido de depósito pagado, con una línea de varias unidades, avanzado hasta el estado pedido
interface DeliveredOrder {
  idOrder: number;
  idPayment: number;
  idLine: number;
  idUser: number;
  variant: number;
}

async function deliveredOrder(
  pool: sql.ConnectionPool,
  tag: string,
  units: number,
  stop: 2 | 5,
): Promise<DeliveredOrder> {
  await pool
    .request()
    .batch(
      "IF NOT EXISTS (SELECT 1 FROM dbo.BankAccounts WHERE BankName = N'RACE Bank') INSERT INTO dbo.BankAccounts (BankName, AccountType, AccountNumber, HolderName) VALUES (N'RACE Bank', N'Checking', N'0001', N'Race');",
    );
  const bank = await scalar(
    pool,
    "SELECT Value = IDBankAccount FROM dbo.BankAccounts WHERE BankName = N'RACE Bank';",
  );
  const operator = await createOperator(pool);
  const [variant = 0] = await createVariants(pool, tag, [30]);
  const [cart] = await createCarts(pool, tag, 1);
  if (cart === undefined) throw new Error('The cart was not created.');
  await addLines(pool, [{ IDCart: cart.IDCart, IDVariant: variant, Quantity: units }]);
  const addresses = await createAddresses(pool, tag);
  const reservation = await reserveCart(pool, cart);
  const order = await placeOrder(
    pool,
    cart,
    reservation,
    addresses.get(cart.IDUser) ?? 0,
    `race-${tag}`,
    2,
    bank,
  );
  const idOrder = order.idOrder ?? 0;
  const idPayment = order.idPayment ?? 0;
  await confirmPayment(pool, idPayment, `${(units * 10).toString()}.00`);
  // Cada paso depende del anterior; inSequence los encadena sin esperar dentro de un bucle
  const steps = [3, 4, 5].filter((status) => status <= stop);
  await inSequence(steps, (status) => changeStatus(pool, operator, idOrder, status));
  const idLine = await scalar(
    pool,
    `SELECT Value = IDOrderLine FROM dbo.OrderLines WHERE IDOrder = ${idOrder};`,
  );
  return { idOrder, idPayment, idLine, idUser: cart.IDUser, variant };
}

async function changeStatus(
  pool: sql.ConnectionPool,
  actor: number,
  idOrder: number,
  status: number,
): Promise<void> {
  await pool
    .request()
    .input('IDActor', sql.Int, actor)
    .input('IDOrder', sql.Int, idOrder)
    .input('NewStatus', sql.TinyInt, status)
    .execute('dbo.SP_Orders_ChangeStatus');
}

// 'ok' si se aceptó, 'refused' si perdió la carrera con un 422, otra cosa es inesperada
async function registerReturn(
  pool: sql.ConnectionPool,
  actor: number,
  idOrder: number,
  idLine: number,
): Promise<string> {
  try {
    await pool
      .request()
      .input('IDActor', sql.Int, actor)
      .input('IDOrder', sql.Int, idOrder)
      .input('Reason', sql.NVarChar(250), 'Race return')
      .input('Lines', sql.NVarChar(sql.MAX), JSON.stringify([{ idOrderLine: idLine, quantity: 1 }]))
      .output('IDReturn', sql.Int)
      .output('IDRefund', sql.Int)
      .output('RefundAmount', sql.Decimal(18, 2))
      .execute('dbo.SP_Returns_Register');
    return 'ok';
  } catch (error) {
    return (error as { number?: number }).number === 50422
      ? 'refused'
      : `error ${(error as { number?: number }).number ?? '?'}`;
  }
}

async function cancelOrder(
  pool: sql.ConnectionPool,
  actor: number,
  idOrder: number,
): Promise<string> {
  try {
    await pool
      .request()
      .input('IDActor', sql.Int, actor)
      .input('IDOrder', sql.Int, idOrder)
      .input('Reason', sql.NVarChar(250), 'Race cancellation')
      .execute('dbo.SP_Orders_Cancel');
    return 'ok';
  } catch (error) {
    return `error ${(error as { number?: number }).number ?? '?'}`;
  }
}

// Veinte devoluciones de una unidad sobre una línea de cinco: se aceptan exactamente cinco, el resto recibe un 422, nada se
// devuelve de más y los reembolsos suman exactamente el total de la línea
async function returnRace(pool: sql.ConnectionPool): Promise<void> {
  const attempts = 20;
  const units = 5;
  console.log(`\n${attempts} simultaneous returns of one unit from a line of ${units}`);
  const operator = await createOperator(pool);
  const order = await deliveredOrder(pool, 'rtn', units, 5);

  const results = await Promise.all(
    Array.from({ length: attempts }, () =>
      registerReturn(pool, operator, order.idOrder, order.idLine),
    ),
  );
  const accepted = results.filter((result) => result === 'ok').length;
  const refused = results.filter((result) => result === 'refused').length;
  console.log(`  accepted ${accepted}, refused ${refused}, other ${attempts - accepted - refused}`);
  check('exactly the units sold are accepted', accepted, units);
  check('every other return is refused with a 422', refused, attempts - units);
  check(
    'the returned units equal the units sold',
    await scalar(
      pool,
      `SELECT Value = ReturnedQuantity FROM dbo.OrderLines WHERE IDOrderLine = ${order.idLine};`,
    ),
    units,
  );
  check(
    'the refunds add up to the exact total of the line, in cents',
    await scalar(
      pool,
      `SELECT Value = CAST(SUM(RefundAmount) * 100 AS INT) FROM dbo.ReturnLines WHERE IDOrderLine = ${order.idLine};`,
    ),
    units * 1000,
  );
  check(
    'one pending refund per accepted return',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.Refunds WHERE IDPayment = ${order.idPayment} AND Status = N'Pending';`,
    ),
    units,
  );
  check(
    'the order ended returned',
    await scalar(
      pool,
      `SELECT Value = IDOrderStatus FROM dbo.Orders WHERE IDOrder = ${order.idOrder};`,
    ),
    8,
  );
  check(
    'the stock went back once per unit',
    await scalar(
      pool,
      `SELECT Value = OnHandStock FROM dbo.Variants WHERE IDVariant = ${order.variant};`,
    ),
    30,
  );
  check(
    'the amounts reconcile',
    await scalar(pool, 'SELECT Value = COUNT(*) FROM dbo.VW_Reconciliation_Amounts;'),
    0,
  );
  await checkInvariant(pool, 'return race', [order.variant]);
}

// El cliente pulsa "cancelar" varias veces a la vez sobre un pedido pagado: se cancela una vez, el stock vuelve una vez y se
// abre un único reembolso
async function cancelRace(pool: sql.ConnectionPool): Promise<void> {
  const attempts = 10;
  console.log(`\n${attempts} simultaneous cancellations of one paid order`);
  const order = await deliveredOrder(pool, 'cnl', 2, 2);

  const results = await Promise.all(
    Array.from({ length: attempts }, () => cancelOrder(pool, order.idUser, order.idOrder)),
  );
  const ok = results.filter((result) => result === 'ok').length;
  console.log(`  answered ${ok}, other ${attempts - ok}`);
  check('every request is answered without an error', ok, attempts);
  check(
    'the order is cancelled',
    await scalar(
      pool,
      `SELECT Value = IDOrderStatus FROM dbo.Orders WHERE IDOrder = ${order.idOrder};`,
    ),
    6,
  );
  check(
    'one refund was opened',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.Refunds WHERE IDPayment = ${order.idPayment};`,
    ),
    1,
  );
  check(
    'the units went back to the stock once',
    await scalar(
      pool,
      `SELECT Value = OnHandStock FROM dbo.Variants WHERE IDVariant = ${order.variant};`,
    ),
    30,
  );
  check(
    'one return movement was written',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.InventoryMovements WHERE IDVariant = ${order.variant} AND IDInventoryMovementType = 4;`,
    ),
    1,
  );
  await checkInvariant(pool, 'cancel race', [order.variant]);
}

// Resultado de una ejecución del job de vencimiento: 'error N' si falló, que en esta prueba nunca debe ocurrir
interface ExpireRun {
  outcome: string;
  expired: number;
  released: number;
}

async function runExpireJob(pool: sql.ConnectionPool): Promise<ExpireRun> {
  try {
    const result = await pool
      .request()
      .output('Outcome', sql.VarChar(10))
      .output('ExpiredOrders', sql.Int)
      .output('ReleasedReservations', sql.Int)
      .execute('dbo.SP_Jobs_ExpirePayments');
    return {
      outcome: String(result.output['Outcome']),
      expired: Number(result.output['ExpiredOrders']),
      released: Number(result.output['ReleasedReservations']),
    };
  } catch (error) {
    return {
      outcome: `error ${(error as { number?: number }).number ?? '?'}`,
      expired: 0,
      released: 0,
    };
  }
}

// El bloqueo de ejecución única: mientras otra conexión sostiene el del job, la llamada responde Skipped sin esperar; los demás
// jobs no se ven afectados; y si la conexión que lo sostenía muere sin soltarlo, SQL Server lo libera
async function jobLock(pool: sql.ConnectionPool, settings: sql.config): Promise<void> {
  console.log('\nthe job lock is held by another connection');
  const holder = await new sql.ConnectionPool({ ...settings, pool: { min: 1, max: 1 } }).connect();
  try {
    await holder
      .request()
      .batch(
        "DECLARE @r INT; EXEC @r = sys.sp_getapplock @Resource = N'Job:ExpirePayments', @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0; IF @r < 0 THROW 50000, 'The test could not take the lock', 1;",
      );
    const blocked = await runExpireJob(pool);
    check('a run while the lock is held is skipped without waiting', blocked.outcome, 'Skipped');
    check('a skipped run did no work', blocked.expired + blocked.released, 0);

    const purge = await pool
      .request()
      .output('Outcome', sql.VarChar(10))
      .execute('dbo.SP_Jobs_PurgeExpired');
    check('another job is not blocked by it', String(purge.output['Outcome']), 'Ran');

    await holder
      .request()
      .batch(
        "EXEC sys.sp_releaseapplock @Resource = N'Job:ExpirePayments', @LockOwner = N'Session';",
      );
    check('once the lock is released the job runs', (await runExpireJob(pool)).outcome, 'Ran');

    await holder
      .request()
      .batch(
        "DECLARE @r INT; EXEC @r = sys.sp_getapplock @Resource = N'Job:ExpirePayments', @LockMode = N'Exclusive', @LockOwner = N'Session', @LockTimeout = 0;",
      );
    check('the lock is taken again', (await runExpireJob(pool)).outcome, 'Skipped');
  } finally {
    // Cerrar la conexión SIN soltar el bloqueo: es lo que hace un proceso que muere
    await holder.close();
  }
  check(
    'the lock of a connection that died is released by SQL Server',
    (await runExpireJob(pool)).outcome,
    'Ran',
  );
}

// Ocho ejecuciones simultáneas del job de vencimiento con pedidos y reservas ya vencidos: ninguna falla, cada pedido se cancela
// una sola vez, lo reservado vuelve al stock y las cuentas cuadran
async function expireRace(pool: sql.ConnectionPool): Promise<void> {
  const orders = 12;
  const carts = 8;
  const callers = 8;
  console.log(`\n${callers} job runs racing to expire ${orders} orders and ${carts} carts`);
  await pool
    .request()
    .batch(
      "IF NOT EXISTS (SELECT 1 FROM dbo.BankAccounts WHERE BankName = N'RACE Bank') INSERT INTO dbo.BankAccounts (BankName, AccountType, AccountNumber, HolderName) VALUES (N'RACE Bank', N'Checking', N'0001', N'Race');",
    );
  const bank = await scalar(
    pool,
    "SELECT Value = IDBankAccount FROM dbo.BankAccounts WHERE BankName = N'RACE Bank';",
  );
  const [variant = 0] = await createVariants(pool, 'exp', [100]);
  const buyers = await createCarts(pool, 'exp', orders + carts);
  await addLines(
    pool,
    buyers.map((cart) => ({ IDCart: cart.IDCart, IDVariant: variant, Quantity: 1 })),
  );
  const addresses = await createAddresses(pool, 'exp');
  const reservations = await Promise.all(buyers.map((cart) => reserveCart(pool, cart)));
  const placed = await Promise.all(
    buyers
      .slice(0, orders)
      .map((cart, index) =>
        placeOrder(
          pool,
          cart,
          reservations[index] ?? 0,
          addresses.get(cart.IDUser) ?? 0,
          `race-exp-${index}`,
          2,
          bank,
        ),
      ),
  );
  check(
    'every order was created',
    placed.filter((order) => order.outcome === 'created').length,
    orders,
  );

  // Se hacen vencer los plazos de los pagos pendientes y de las reservas de los carritos que no confirmaron
  await pool.request().batch(`
    UPDATE p SET ExpiresAt = DATEADD(HOUR, -1, SYSUTCDATETIME())
    FROM dbo.Payments AS p JOIN dbo.Orders AS o ON o.IDOrder = p.IDOrder JOIN dbo.Users AS u ON u.IDUser = o.IDUser
    WHERE u.Email LIKE N'race-%@shopcart.test' AND p.IDPaymentStatus = 1;
    UPDATE r SET ExpiresAt = DATEADD(HOUR, -1, SYSUTCDATETIME())
    FROM dbo.Reservations AS r JOIN dbo.Users AS u ON u.IDUser = r.IDUser
    WHERE u.Email LIKE N'race-%@shopcart.test' AND r.Status = N'Active' AND r.IDOrder IS NULL;
  `);

  const runs = await Promise.all(Array.from({ length: callers }, () => runExpireJob(pool)));
  const errors = runs.filter((run) => run.outcome.startsWith('error')).length;
  const ranRuns = runs.filter((run) => run.outcome === 'Ran');
  console.log(
    `  ran ${ranRuns.length}, skipped ${runs.filter((run) => run.outcome === 'Skipped').length}, errors ${errors}`,
  );
  check('no run fails', errors, 0);
  check('at least one run did the work', ranRuns.length >= 1, true);
  check(
    'the orders were cancelled by the runs',
    ranRuns.reduce((sum, run) => sum + run.expired, 0) >= orders,
    true,
  );
  check(
    'the abandoned carts were released by the runs',
    ranRuns.reduce((sum, run) => sum + run.released, 0) >= carts,
    true,
  );

  const ids = placed.map((order) => order.idOrder ?? 0).join(',');
  check(
    'every expired order is cancelled',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.Orders WHERE IDOrder IN (${ids}) AND IDOrderStatus = 6;`,
    ),
    orders,
  );
  check(
    'every payment of those orders expired',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.Payments WHERE IDOrder IN (${ids}) AND IDPaymentStatus = 6;`,
    ),
    orders,
  );
  check(
    'no reservation of the scenario is left active',
    await scalar(
      pool,
      `SELECT Value = COUNT(*) FROM dbo.Reservations AS r JOIN dbo.Users AS u ON u.IDUser = r.IDUser WHERE u.Email LIKE N'race-exp%' AND r.Status = N'Active';`,
    ),
    0,
  );
  check('nothing stays reserved', await reservedStock(pool, variant), 0);
  check(
    'the stock was never touched, because no payment was approved',
    await scalar(
      pool,
      `SELECT Value = OnHandStock FROM dbo.Variants WHERE IDVariant = ${variant};`,
    ),
    100,
  );
  check('one more run finds nothing to do', (await runExpireJob(pool)).expired, 0);
  await checkInvariant(pool, 'expire race', [variant]);
}

async function confirmPayment(
  pool: sql.ConnectionPool,
  idPayment: number,
  amount: string,
): Promise<string> {
  try {
    const result = await pool
      .request()
      .input('IDPayment', sql.Int, idPayment)
      .input('ReceivedAmount', sql.Decimal(18, 2), amount)
      .input('Source', sql.NVarChar(20), 'Webhook')
      .output('Outcome', sql.VarChar(20))
      .execute('dbo.SP_Payments_ConfirmPayment');
    return String(result.output['Outcome']);
  } catch (error) {
    return `error ${(error as { number?: number }).number ?? '?'}`;
  }
}

// Varios escenarios necesitan al operador: se crea una vez y los demás reutilizan el mismo
async function createOperator(pool: sql.ConnectionPool): Promise<number> {
  const result = await pool.request().query<{ IDUser: number }>(`
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Email = N'race-operator@shopcart.test')
      INSERT INTO dbo.Users (IDRole, Email, PasswordHash, FullName)
      VALUES (2, N'race-operator@shopcart.test', N'not-a-real-hash', N'Concurrency operator');
    SELECT IDUser FROM dbo.Users WHERE Email = N'race-operator@shopcart.test';
  `);
  return result.recordset[0]?.IDUser ?? 0;
}

async function registerProof(
  pool: sql.ConnectionPool,
  idUser: number,
  idPayment: number,
  index: number,
): Promise<void> {
  await pool
    .request()
    .input('IDUser', sql.Int, idUser)
    .input('IDPayment', sql.Int, idPayment)
    .input('OriginalFileName', sql.NVarChar(255), 'receipt.png')
    .input('StorageKey', sql.NVarChar(100), `race-proof-${index}-${idPayment}`)
    .input('MimeType', sql.NVarChar(50), 'image/png')
    .input('SizeBytes', sql.Int, 2048)
    .input('Sha256Hash', sql.Char(64), String(index).padStart(64, '0'))
    .input('ReferenceNumber', sql.NVarChar(40), `RACE-${index}-${idPayment}`)
    .input('DepositDate', sql.Date, new Date())
    .input('DepositedAmount', sql.Decimal(18, 2), '10.00')
    .output('IDPaymentProof', sql.Int)
    .execute('dbo.SP_Payments_RegisterProof');
}

// 'ok' si el procedimiento respondió, 'refused' si lo rechazó con un 422 (perdió la carrera), otra cosa es inesperada
async function reviewDeposit(
  pool: sql.ConnectionPool,
  procedure: string,
  actor: number,
  idPayment: number,
): Promise<string> {
  try {
    const request = pool
      .request()
      .input('IDActor', sql.Int, actor)
      .input('IDPayment', sql.Int, idPayment)
      .output('Outcome', sql.VarChar(30));
    if (procedure.endsWith('RejectDeposit'))
      request.input('Reason', sql.NVarChar(250), 'Race rejection');
    await request.execute(procedure);
    return 'ok';
  } catch (error) {
    return (error as { number?: number }).number === 50422
      ? 'refused'
      : `error ${(error as { number?: number }).number ?? '?'}`;
  }
}

async function main(): Promise<number> {
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const config = loadConfig(process.env);

  const settings: sql.config = {
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 60_000,
    pool: { min: 1, max: MAX_CONNECTIONS },
  };
  const pool = await new sql.ConnectionPool(settings).connect();

  try {
    console.log(`Concurrency checks in ${config.database} on ${config.host}:${config.port}.`);
    await cleanUp(pool);
    await createAdmin(pool);
    const scenarios = [
      () => race(pool, 'one', 100, 1),
      () => race(pool, 'ten', 100, 10),
      () => doubleClick(pool),
      () => allOrNothing(pool),
      () => crossingCarts(pool),
      () => ledgerEntries(pool),
      () => idempotencyRace(pool),
      () => orderDoubleClick(pool),
      () => lastCouponUse(pool),
      () => paymentConfirmRace(pool),
      () => approveVersusReject(pool),
      () => returnRace(pool),
      () => cancelRace(pool),
      () => jobLock(pool, settings),
      () => expireRace(pool),
    ];
    await inSequence(scenarios, (scenario) => scenario());
  } finally {
    await cleanUp(pool).catch((error: unknown) => {
      console.error(
        'Could not remove the test data:',
        error instanceof Error ? error.message : error,
      );
    });
    await pool.close();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join('; ')}`);
    return 1;
  }
  console.log('\nAll concurrency guarantees hold.');
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
