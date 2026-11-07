import { describe, expect, it } from 'vitest';
import { secondsLeft } from '../../src/shared/ui/countdown';

describe('secondsLeft', () => {
  const until = '2030-01-01T00:15:00Z';
  const start = new Date('2030-01-01T00:00:00Z').getTime();

  it('counts the seconds to the deadline', () => {
    expect(secondsLeft(until, start)).toBe(900);
  });

  it('rounds a partial second up so it never shows 00:00 early', () => {
    expect(secondsLeft(until, start + 500)).toBe(900);
  });

  it('never goes negative after the deadline', () => {
    expect(secondsLeft(until, start + 3_600_000)).toBe(0);
  });
});
