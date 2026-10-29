import { beforeEach, describe, expect, it, vi } from 'vitest';

// Estado compartido con el doble del driver; vi.hoisted lo crea antes de que se evalúe vi.mock
const driver = vi.hoisted(() => ({
  failToConnect: false,
  created: 0,
  closed: 0,
}));

vi.mock('mssql', () => {
  class FakeConnectionPool {
    connected = false;
    connecting = false;

    constructor(readonly config: unknown) {
      driver.created += 1;
    }

    connect(): Promise<this> {
      if (driver.failToConnect) return Promise.reject(new Error('connection refused'));
      this.connected = true;
      return Promise.resolve(this);
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
};

beforeEach(() => {
  driver.failToConnect = false;
  driver.created = 0;
  driver.closed = 0;
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
});
