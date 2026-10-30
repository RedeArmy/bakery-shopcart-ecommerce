import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { divRoundHalfEven } from '../../src/shared-kernel/index.js';

const MONEY_TEST_FILE = new URL('../../../db/tests/tsqlt/060_Test_Money.sql', import.meta.url);

// Lee los vectores de la prueba tSQLt: así el oráculo de TypeScript y la función SQL se comparan con los mismos datos
function readSharedVectors(): { n: bigint; d: bigint; expected: bigint }[] {
  const sql = readFileSync(MONEY_TEST_FILE, 'utf8');
  const block = /-- vectors:begin([\s\S]*?)-- vectors:end/.exec(sql)?.[1] ?? '';
  return [...block.matchAll(/\((\d+), (\d+), (\d+)\)/g)].map(([, n, d, expected]) => ({
    n: BigInt(n ?? ''),
    d: BigInt(d ?? ''),
    expected: BigInt(expected ?? ''),
  }));
}

describe('divRoundHalfEven', () => {
  const vectors = readSharedVectors();

  it('reads the vectors shared with the SQL test', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(20);
  });

  it.each(vectors.map((v) => [`${v.n} / ${v.d}`, v] as const))(
    'agrees with the SQL function on %s',
    (_label, { n, d, expected }) => {
      expect(divRoundHalfEven(n, d)).toBe(expected);
    },
  );

  it('rounds an exact tie to the even integer', () => {
    expect(divRoundHalfEven(5n, 2n)).toBe(2n);
    expect(divRoundHalfEven(7n, 2n)).toBe(4n);
    expect(divRoundHalfEven(24545000n, 10000n)).toBe(2454n);
  });

  it('never moves more than half a unit from the exact quotient', () => {
    for (let n = 0n; n <= 600n; n += 1n) {
      for (let d = 1n; d <= 25n; d += 1n) {
        const result = divRoundHalfEven(n, d);
        const distance = 2n * result * d - 2n * n;
        expect(distance < 0n ? -distance : distance).toBeLessThanOrEqual(d);
      }
    }
  });

  it.each([
    [-1n, 2n],
    [1n, 0n],
    [1n, -2n],
  ])('rejects %s / %s because it is outside the domain', (n, d) => {
    expect(() => divRoundHalfEven(n, d)).toThrow(RangeError);
  });
});
