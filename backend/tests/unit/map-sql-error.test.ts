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
