import { describe, expect, it } from 'vitest';
import { isDeadlock, mapSqlError } from '../../src/platform/db/map-sql-error.js';

const sqlError = (number: number, message: string) => Object.assign(new Error(message), { number });

describe('mapSqlError', () => {
  it.each([
    [50400, 400],
    [50404, 404],
    [50409, 409],
    [50422, 422],
  ])('maps THROW %i to HTTP %i', (number, httpStatus) => {
    expect(mapSqlError(sqlError(number, 'x')).httpStatus).toBe(httpStatus);
  });

  it('keeps the stable API code a procedure puts before its message', () => {
    const mapped = mapSqlError(sqlError(50409, 'INSUFFICIENT_STOCK: Only 2 units are available.'));
    expect(mapped.httpStatus).toBe(409);
    expect(mapped.code).toBe('INSUFFICIENT_STOCK');
    expect(mapped.message).toBe('Only 2 units are available.');
  });

  it('falls back to the generic code when the message has no stable prefix', () => {
    expect(mapSqlError(sqlError(50422, 'Only a delivered order can be returned.')).code).toBe(
      'BUSINESS_RULE_VIOLATION',
    );
  });

  it('maps unknown database errors to a generic 500 without leaking the message', () => {
    const mapped = mapSqlError(sqlError(208, 'Invalid object name dbo.Secrets'));
    expect(mapped.httpStatus).toBe(500);
    expect(mapped.message).not.toContain('Secrets');
  });

  it('detects deadlocks (1205) so the executor can retry', () => {
    expect(isDeadlock(sqlError(1205, 'deadlock'))).toBe(true);
    expect(isDeadlock(sqlError(50409, 'conflict'))).toBe(false);
  });
});
