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
    BEGIN TRY
      DELETE m FROM dbo.InventoryMovements AS m JOIN dbo.Variants AS v ON v.IDVariant = m.IDVariant WHERE v.SKU LIKE @sku;
      DELETE a FROM dbo.AuditLog AS a JOIN dbo.Variants AS v ON a.Module = N'Stock' AND a.EntityKey = CAST(v.IDVariant AS NVARCHAR(40)) WHERE v.SKU LIKE @sku;
    END TRY
    BEGIN CATCH
      ENABLE TRIGGER dbo.TR_InventoryMovements_Immutable ON dbo.InventoryMovements;
      ENABLE TRIGGER dbo.TR_AuditLog_Immutable ON dbo.AuditLog;
      THROW;
    END CATCH;
    ENABLE TRIGGER dbo.TR_InventoryMovements_Immutable ON dbo.InventoryMovements;
    ENABLE TRIGGER dbo.TR_AuditLog_Immutable ON dbo.AuditLog;

    DELETE rl FROM dbo.ReservationLines AS rl JOIN dbo.Variants AS v ON v.IDVariant = rl.IDVariant WHERE v.SKU LIKE @sku;
    DELETE r FROM dbo.Reservations AS r JOIN dbo.Users AS u ON u.IDUser = r.IDUser WHERE u.Email LIKE @email;
    DELETE ci FROM dbo.CartItems AS ci JOIN dbo.Carts AS c ON c.IDCart = ci.IDCart JOIN dbo.Users AS u ON u.IDUser = c.IDUser WHERE u.Email LIKE @email;
    DELETE c FROM dbo.Carts AS c JOIN dbo.Users AS u ON u.IDUser = c.IDUser WHERE u.Email LIKE @email;
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

async function main(): Promise<number> {
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const config = loadConfig(process.env);

  const pool = await new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 60_000,
    pool: { min: 1, max: MAX_CONNECTIONS },
  }).connect();

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
