import { describe, expect, it } from 'vitest';
import {
  MAX_MILLISECONDS,
  assertBenchDatabase,
  assess,
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
