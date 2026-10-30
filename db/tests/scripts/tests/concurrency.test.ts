import { describe, expect, it } from 'vitest';
import { classifyOutcome, retryOnDeadlock, tally } from '../lib/concurrency.js';

const sqlError = (number: number) => Object.assign(new Error(`SQL error ${number}`), { number });

describe('classifyOutcome', () => {
  it('counts a call without error as reserved', () => {
    expect(classifyOutcome(undefined)).toBe('reserved');
  });

  it('recognises the stock conflict and the deadlock victim', () => {
    expect(classifyOutcome(sqlError(50409))).toBe('conflict');
    expect(classifyOutcome(sqlError(1205))).toBe('deadlock');
  });

  it.each([sqlError(50404), new Error('timeout'), 'text', null])(
    'treats %s as any other failure',
    (error) => {
      expect(classifyOutcome(error)).toBe('other');
    },
  );
});

describe('tally', () => {
  it('counts every outcome', () => {
    expect(tally(['reserved', 'conflict', 'conflict', 'other'])).toEqual({
      reserved: 1,
      conflict: 2,
      deadlock: 0,
      other: 1,
    });
  });
});

describe('retryOnDeadlock', () => {
  it('retries after a deadlock and reports the final result', async () => {
    let calls = 0;
    const outcome = await retryOnDeadlock(() => {
      calls += 1;
      return calls < 3 ? Promise.reject(sqlError(1205)) : Promise.resolve();
    });

    expect(outcome).toBe('reserved');
    expect(calls).toBe(3);
  });

  it('gives up after the attempts are used and reports the deadlock', async () => {
    let calls = 0;
    const outcome = await retryOnDeadlock(() => {
      calls += 1;
      return Promise.reject(sqlError(1205));
    }, 3);

    expect(outcome).toBe('deadlock');
    expect(calls).toBe(3);
  });

  it('does not retry a business conflict', async () => {
    let calls = 0;
    const outcome = await retryOnDeadlock(() => {
      calls += 1;
      return Promise.reject(sqlError(50409));
    });

    expect(outcome).toBe('conflict');
    expect(calls).toBe(1);
  });
});
