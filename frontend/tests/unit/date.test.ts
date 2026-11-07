// cspell:disable
import { describe, expect, it } from 'vitest';
import { formatDateOnly, isDateOnly, todayText } from '../../src/shared/lib/date';

describe('date helpers', () => {
  it('recognises a date without time', () => {
    expect(isDateOnly('2030-06-10')).toBe(true);
    expect(isDateOnly('2030-06-10T10:00:00Z')).toBe(false);
    expect(isDateOnly('')).toBe(false);
  });

  it('writes today in the browser calendar', () => {
    expect(todayText(new Date(2030, 0, 5, 23, 59))).toBe('2030-01-05');
  });

  it('formats a date in Spanish without shifting the day', () => {
    expect(formatDateOnly('2030-06-10')).toContain('10');
    expect(formatDateOnly('2030-06-10')).toContain('junio');
  });

  it('returns text that is not a date as it came', () => {
    expect(formatDateOnly('pronto')).toBe('pronto');
  });
});
