import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/shared/lib/money/money';

describe('formatMoney', () => {
  it('formats "145.00" as Q145.00', () => {
    expect(formatMoney('145.00')).toBe('Q145.00');
  });

  it('groups thousands and keeps the two decimals', () => {
    expect(formatMoney('1234567.50')).toBe('Q1,234,567.50');
  });

  it('formats zero', () => {
    expect(formatMoney('0.00')).toBe('Q0.00');
  });

  // 0.1 + 0.2 no es 0.3 en coma flotante: un importe grande debe conservar cada dígito
  it('keeps every digit of an amount a double cannot represent', () => {
    expect(formatMoney('9007199254740993.01')).toBe('Q9,007,199,254,740,993.01');
  });

  it.each(['145', '145.5', '145.000', '-1.00', '1e3.00', ' 1.00', 'abc', ''])(
    'rejects "%s" because it is not a two-decimal amount',
    (value) => {
      expect(() => formatMoney(value)).toThrow(RangeError);
    },
  );
});
