// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  dayEnd,
  dayStart,
  formatDateOnly,
  isDateOnly,
  isReversedRange,
  todayText,
} from '../../src/shared/lib/date';

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

  it('starts a day at midnight in Guatemala and ends it at the next midnight', () => {
    expect(dayStart('2030-06-10')).toBe('2030-06-10T00:00:00-06:00');
    // La medianoche de Guatemala es las 06:00 de UTC; el día que termina es el siguiente a las 06:00
    expect(dayEnd('2030-06-10')).toBe('2030-06-11T06:00:00.000Z');
    expect(dayEnd('2030-06-30')).toBe('2030-07-01T06:00:00.000Z');
    expect(dayEnd('2030-12-31')).toBe('2031-01-01T06:00:00.000Z');
  });

  it('knows when a range is reversed', () => {
    expect(isReversedRange('2030-06-10', '2030-06-01')).toBe(true);
    expect(isReversedRange('2030-06-01', '2030-06-01')).toBe(false);
    expect(isReversedRange(null, '2030-06-01')).toBe(false);
    expect(isReversedRange('2030-06-01', null)).toBe(false);
  });
});
