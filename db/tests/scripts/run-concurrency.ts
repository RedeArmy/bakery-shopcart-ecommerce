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

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  // Sin plantillas anidadas: lo esperado solo se muestra cuando la comprobación falla
  const detail = ok ? '' : ' (expected ' + String(expected) + ')';
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${String(actual)}${detail}`);
  if (!ok) failures.push(name);
}

// Todo se ejecuta con sa sobre la base de pruebas: los datos de la prueba se identifican por su prefijo y se borran al terminar
async function cleanUp(pool: sql.ConnectionPool): Promise<void> {
  await pool
    .request()
    .input('email', sql.NVarChar(256), EMAIL_PATTERN)
    .input('sku', sql.NVarChar(40), SKU_PATTERN)
    .input('category', sql.NVarChar(80), CATEGORY_NAME).batch(`
    DELETE rl FROM dbo.ReservationLines AS rl JOIN dbo.Variants AS v ON v.IDVariant = rl.IDVariant WHERE v.SKU LIKE @sku;
    DELETE r FROM dbo.Reservations AS r JOIN dbo.Users AS u ON u.IDUser = r.IDUser WHERE u.Email LIKE @email;
    DELETE ci FROM dbo.CartItems AS ci JOIN dbo.Carts AS c ON c.IDCart = ci.IDCart JOIN dbo.Users AS u ON u.IDUser = c.IDUser WHERE u.Email LIKE @email;
    DELETE c FROM dbo.Carts AS c JOIN dbo.Users AS u ON u.IDUser = c.IDUser WHERE u.Email LIKE @email;
    DELETE FROM dbo.Variants WHERE SKU LIKE @sku;
    DELETE p FROM dbo.Products AS p JOIN dbo.Categories AS cat ON cat.IDCategory = p.IDCategory WHERE cat.Name = @category;
    DELETE FROM dbo.Categories WHERE Name = @category;
    DELETE FROM dbo.Users WHERE Email LIKE @email;
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
        .input('sku', sql.NVarChar(40), `RACE-${tag}-${index}`)
        .input('stock', sql.Int, stock).query<{ IDVariant: number }>(`
        INSERT INTO dbo.Products (IDCategory, Name) SELECT IDCategory, @product FROM dbo.Categories WHERE Name = @category;
        INSERT INTO dbo.Variants (IDProduct, SKU, Price, OnHandStock)
        OUTPUT inserted.IDVariant
        SELECT IDProduct, @sku, 10.00, @stock FROM dbo.Products WHERE Name = @product;
      `);
      return result.recordset[0]?.IDVariant ?? 0;
    }),
  );
  return ids;
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
    const scenarios = [
      () => race(pool, 'one', 100, 1),
      () => race(pool, 'ten', 100, 10),
      () => doubleClick(pool),
      () => allOrNothing(pool),
      () => crossingCarts(pool),
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
