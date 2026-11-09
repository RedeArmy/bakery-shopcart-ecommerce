import { beforeEach, describe, expect, it, vi } from 'vitest';

// Estado compartido con el doble del driver; vi.hoisted lo crea antes de que se evalúe vi.mock
const driver = vi.hoisted(() => ({
  failToConnect: false,
  created: 0,
  closed: 0,
  connects: 0,
  // Mientras tenga un valor, connect() espera a que la prueba lo libere: así se simula una conexión lenta
  gate: undefined as Promise<void> | undefined,
}));

vi.mock('mssql', () => {
  class FakeConnectionPool {
    connected = false;
    connecting = false;

    constructor(readonly config: unknown) {
      driver.created += 1;
    }

    async connect(): Promise<this> {
      driver.connects += 1;
      if (this.connecting) throw new Error('Database is already connecting');
      this.connecting = true;
      await driver.gate;
      this.connecting = false;
      if (driver.failToConnect) throw new Error('connection refused');
      this.connected = true;
      return this;
    }

    close(): Promise<void> {
      this.connected = false;
      driver.closed += 1;
      return Promise.resolve();
    }
  }
  return { default: { ConnectionPool: FakeConnectionPool } };
});

const { createDatabase } = await import('../../src/platform/db/pool.js');

const settings = {
  DB_HOST: 'db',
  DB_PORT: 1433,
  DB_NAME: 'ShopCart',
  DB_APP_USER: 'shopcart_app',
  DB_APP_PASSWORD: 'secret',
  DB_TRUST_SERVER_CERTIFICATE: undefined,
  NODE_ENV: 'development' as const,
};

const trustOf = async (database: ReturnType<typeof createDatabase>): Promise<unknown> => {
  const pool = (await database.getPool()) as unknown as {
    config: { options: { trustServerCertificate: unknown } };
  };
  return pool.config.options.trustServerCertificate;
};

beforeEach(() => {
  driver.failToConnect = false;
  driver.created = 0;
  driver.closed = 0;
  driver.connects = 0;
  driver.gate = undefined;
});

describe('database pool certificate trust', () => {
  it('trusts the development certificate outside production', async () => {
    expect(await trustOf(createDatabase(settings))).toBe(true);
  });

  it('does not trust an unknown certificate in production unless asked to', async () => {
    expect(await trustOf(createDatabase({ ...settings, NODE_ENV: 'production' }))).toBe(false);
    expect(
      await trustOf(
        createDatabase({ ...settings, NODE_ENV: 'production', DB_TRUST_SERVER_CERTIFICATE: true }),
      ),
    ).toBe(true);
  });

  it('lets the setting turn the trust off in development', async () => {
    expect(await trustOf(createDatabase({ ...settings, DB_TRUST_SERVER_CERTIFICATE: false }))).toBe(
      false,
    );
  });
});

describe('database pool', () => {
  it('reuses one connected pool for every caller', async () => {
    const database = createDatabase(settings);
    const first = await database.getPool();
    const second = await database.getPool();
    expect(second).toBe(first);
    expect(driver.created).toBe(1);
  });

  it('reports the connection as healthy when the driver connects', async () => {
    expect(await createDatabase(settings).checkConnection()).toBe(true);
  });

  it('reports it as unhealthy, discards the pool and retries cleanly next time', async () => {
    const database = createDatabase(settings);
    driver.failToConnect = true;
    expect(await database.checkConnection()).toBe(false);
    expect(driver.closed).toBe(1);

    driver.failToConnect = false;
    expect(await database.checkConnection()).toBe(true);
    expect(driver.created).toBe(2);
  });

  it('closes the pool and allows a new one to be created afterwards', async () => {
    const database = createDatabase(settings);
    await database.getPool();
    await database.close();
    expect(driver.closed).toBe(1);

    await database.getPool();
    expect(driver.created).toBe(2);
  });

  it('does nothing when closing a pool that was never opened', async () => {
    await createDatabase(settings).close();
    expect(driver.closed).toBe(0);
  });

  it('makes callers that arrive while the pool is still connecting wait for that one connection', async () => {
    let release: () => void = () => undefined;
    driver.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const database = createDatabase(settings);

    // Tres llamadas a la vez con la conexión en curso: antes la segunda recibía un pool que aún no servía
    const calls = [database.getPool(), database.getPool(), database.getPool()];
    release();
    const pools = await Promise.all(calls);

    expect(driver.connects).toBe(1);
    expect(pools[1]).toBe(pools[0]);
    expect(pools[2]).toBe(pools[0]);
    expect((pools[0] as unknown as { connected: boolean }).connected).toBe(true);
  });

  it('lets every waiting caller see the failure and tries again on the next call', async () => {
    let release: () => void = () => undefined;
    driver.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    driver.failToConnect = true;
    const database = createDatabase(settings);

    const settled = Promise.allSettled([database.getPool(), database.getPool()]);
    release();
    expect((await settled).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(driver.connects).toBe(1);

    driver.failToConnect = false;
    driver.gate = undefined;
    await expect(database.getPool()).resolves.toBeDefined();
    expect(driver.connects).toBe(2);
  });
});

describe('database connection hook', () => {
  it('runs once per established connection, not once per caller', async () => {
    const onConnected = vi.fn();
    const database = createDatabase(settings, { onConnected });

    await Promise.all([database.getPool(), database.getPool()]);
    await database.getPool();

    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  it('runs again when the connection is re-established after a drop', async () => {
    const onConnected = vi.fn();
    const database = createDatabase(settings, { onConnected });
    const pool = (await database.getPool()) as unknown as { connected: boolean };

    // La base de datos se cayó: el driver deja de estar conectado y la siguiente llamada vuelve a conectar
    pool.connected = false;
    await database.getPool();

    expect(onConnected).toHaveBeenCalledTimes(2);
    expect(driver.connects).toBe(2);
  });

  it('does not run when the connection fails', async () => {
    const onConnected = vi.fn();
    driver.failToConnect = true;
    await expect(createDatabase(settings, { onConnected }).getPool()).rejects.toThrow();
    expect(onConnected).not.toHaveBeenCalled();
  });
});
