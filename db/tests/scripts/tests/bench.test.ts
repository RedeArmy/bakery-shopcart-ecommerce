import { describe, expect, it } from 'vitest';
import {
  MAX_MILLISECONDS,
  assertBenchDatabase,
  assess,
  loadBenchSettings,
  logicalReads,
  type BenchCase,
} from '../lib/bench.js';

const benchCase: BenchCase = {
  name: 'Orders_List',
  sql: 'EXEC dbo.SP_Orders_List',
  maxReads: 1000,
};

describe('logicalReads', () => {
  it('adds the logical reads of every table', () => {
    expect(
      logicalReads([
        "Table 'Orders'. Scan count 1, logical reads 120, physical reads 0, read-ahead reads 0.",
        "Table 'Users'. Scan count 20, logical reads 80, physical reads 0, read-ahead reads 0.",
      ]),
    ).toBe(200);
  });

  it('counts a Worktable, which is where a window spool shows up', () => {
    expect(
      logicalReads(["Table 'Worktable'. Scan count 3, logical reads 100778, physical reads 0."]),
    ).toBe(100778);
  });

  it('ignores the messages that are not about reads', () => {
    expect(
      logicalReads(['SQL Server Execution Times:', 'CPU time = 0 ms, elapsed time = 3 ms.']),
    ).toBe(0);
    expect(logicalReads([])).toBe(0);
  });
});

describe('assess', () => {
  it('accepts a measurement inside both limits', () => {
    expect(
      assess(benchCase, { name: benchCase.name, reads: 1000, milliseconds: 20 }),
    ).toBeUndefined();
  });

  it('flags the reads above the limit', () => {
    expect(assess(benchCase, { name: benchCase.name, reads: 1001, milliseconds: 20 })).toMatch(
      /1001 logical reads, the limit is 1000/,
    );
  });

  it('flags a query slower than the one second the brief asks for', () => {
    expect(
      assess(benchCase, { name: benchCase.name, reads: 10, milliseconds: MAX_MILLISECONDS + 1 }),
    ).toMatch(/limit is 1000/);
  });
});

describe('assess with its own time limit', () => {
  const slowReport: BenchCase = { ...benchCase, maxMilliseconds: 3000 };

  it('lets a report that grows with the orders take longer than a second at ten times the volume', () => {
    expect(
      assess(slowReport, { name: slowReport.name, reads: 10, milliseconds: 2500 }),
    ).toBeUndefined();
  });

  it('still flags it when it exceeds its own limit', () => {
    expect(assess(slowReport, { name: slowReport.name, reads: 10, milliseconds: 3001 })).toMatch(
      /limit is 3000/,
    );
  });
});

describe('assertBenchDatabase', () => {
  it('accepts a name that ends in _Bench', () => {
    expect(assertBenchDatabase('ShopCart_Bench')).toBe('ShopCart_Bench');
  });

  it.each(['ShopCart', 'ShopCart_CI', 'ShopCart_Bench_old', 'master', '_Bench', 'a]; DROP_Bench'])(
    'refuses %s, so the delivered or the tSQLt database never gets 50,000 orders',
    (name) => {
      expect(() => assertBenchDatabase(name)).toThrow(/must end in _Bench/);
    },
  );
});

describe('loadBenchSettings', () => {
  const env = { SQL_TEST_PASSWORD: 'Abcdefg12345' };

  it('has defaults for the local test server and the benchmark database', () => {
    expect(loadBenchSettings(env)).toEqual({
      host: 'localhost',
      port: 14333,
      user: 'sa',
      password: 'Abcdefg12345',
      trustServerCertificate: true,
      database: 'ShopCart_Bench',
    });
  });

  it('falls back to the sa password of the .env file', () => {
    expect(loadBenchSettings({ MSSQL_SA_PASSWORD: 'FromDotEnv123' }).password).toBe(
      'FromDotEnv123',
    );
  });

  it.each([{}, { SQL_TEST_PASSWORD: '' }])(
    'asks for the password when it is missing (%j)',
    (partial) => {
      expect(() => loadBenchSettings(partial)).toThrow(/Set SQL_TEST_PASSWORD/);
    },
  );

  it('refuses a server that is not local, so 50,000 orders never land on a shared one', () => {
    expect(() => loadBenchSettings({ ...env, SQL_TEST_HOST: 'db.example.test' })).toThrow(
      /Refusing to load volume data into "db.example.test"/,
    );
  });

  it.each(['localhost', '127.0.0.1', '::1'])('accepts the local host %s', (host) => {
    expect(loadBenchSettings({ ...env, SQL_TEST_HOST: host }).host).toBe(host);
  });

  it('reads the port and the user from the environment', () => {
    const settings = loadBenchSettings({ ...env, SQL_TEST_PORT: '15000', SQL_TEST_USER: 'loader' });
    expect(settings.port).toBe(15000);
    expect(settings.user).toBe('loader');
  });

  it.each(['abc', '0', '70000', '1.5'])('rejects the port %s', (port) => {
    expect(() => loadBenchSettings({ ...env, SQL_TEST_PORT: port })).toThrow(/SQL_TEST_PORT/);
  });

  it('refuses a database that is not a benchmark one', () => {
    expect(() => loadBenchSettings({ ...env, SQL_BENCH_DATABASE: 'ShopCart' })).toThrow(
      /must end in _Bench/,
    );
  });
});
