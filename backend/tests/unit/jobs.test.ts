import { describe, expect, it, vi } from 'vitest';
import { createSqlJobs } from '../../src/platform/db/jobs-store.js';
import type { ProcedureExecutor } from '../../src/platform/db/execute-procedure.js';
import { buildJobs } from '../../src/platform/jobs/job-definitions.js';
import type { JobsPort } from '../../src/platform/jobs/job-definitions.js';
import { createJobRunner } from '../../src/platform/jobs/job-runner.js';
import type { JobDefinition, JobResult, Timers } from '../../src/platform/jobs/job-runner.js';
import type { Logger } from '../../src/platform/logging/logger.js';

/** Temporizadores a mano: el tiempo solo avanza cuando la prueba lo dispara. */
class ManualTimers implements Timers {
  private next = 1;
  readonly pending = new Map<number, { callback: () => void; delay: number }>();

  set(callback: () => void, delay: number): unknown {
    const id = this.next;
    this.next += 1;
    this.pending.set(id, { callback, delay });
    return id;
  }

  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  /** Dispara el temporizador más próximo y deja correr las promesas que desencadena. */
  async fire(): Promise<number | undefined> {
    const entry = [...this.pending.entries()].sort((a, b) => a[1].delay - b[1].delay)[0];
    if (entry === undefined) return undefined;
    this.pending.delete(entry[0]);
    entry[1].callback();
    await new Promise((resolve) => setImmediate(resolve));
    return entry[1].delay;
  }
}

function recordingLogger() {
  const calls: { level: string; message: string; context: Record<string, unknown> }[] = [];
  const log =
    (level: string) =>
    (context: Record<string, unknown> | string, message?: string): void => {
      calls.push({
        level,
        message: typeof context === 'string' ? context : (message ?? ''),
        context: typeof context === 'string' ? {} : context,
      });
    };
  const logger = {
    info: log('info'),
    debug: log('debug'),
    error: log('error'),
    warn: log('warn'),
  } as unknown as Logger;
  return { logger, calls };
}

const clock = { now: () => new Date('2030-06-01T12:00:00Z') };
const ran = (counts: Record<string, number> = {}): JobResult => ({ outcome: 'Ran', counts });

function job(
  name: string,
  run: () => Promise<JobResult>,
  intervalMs = 1000,
  startDelayMs = 10,
): JobDefinition {
  return { name, intervalMs, startDelayMs, run };
}

describe('job runner', () => {
  it('waits for the start delay, runs the job and schedules the next run after it finishes', async () => {
    const timers = new ManualTimers();
    const run = vi.fn(() => Promise.resolve(ran({ expiredOrders: 2 })));
    const { logger, calls } = recordingLogger();
    const runner = createJobRunner({ jobs: [job('a', run, 1000, 10)], logger, clock, timers });

    runner.start();
    expect([...timers.pending.values()].map((entry) => entry.delay)).toEqual([10]);
    expect(await timers.fire()).toBe(10);

    expect(run).toHaveBeenCalledTimes(1);
    // El siguiente se programa al terminar, a un intervalo completo
    expect([...timers.pending.values()].map((entry) => entry.delay)).toEqual([1000]);
    const [status] = runner.status();
    expect(status).toMatchObject({
      runs: 1,
      lastOutcome: 'Ran',
      lastCounts: { expiredOrders: 2 },
      running: false,
    });
    expect(calls.find((call) => call.message === 'Job ran')?.level).toBe('info');
  });

  it('never overlaps a job with itself: the next run waits for the current one', async () => {
    const timers = new ManualTimers();
    let release: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<JobResult>((resolve) => {
          release = () => {
            resolve(ran());
          };
        }),
    );
    const runner = createJobRunner({
      jobs: [job('slow', run)],
      logger: recordingLogger().logger,
      clock,
      timers,
    });

    runner.start();
    await timers.fire();
    expect(runner.status()[0]?.running).toBe(true);
    // Mientras corre no hay otro temporizador esperando
    expect(timers.pending.size).toBe(0);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(timers.pending.size).toBe(1);
  });

  it('logs a failure, keeps the job scheduled and resets the streak after a success', async () => {
    const timers = new ManualTimers();
    const outcomes: (() => Promise<JobResult>)[] = [
      () => Promise.reject(new Error('database down')),
      () => Promise.reject(new Error('database down')),
      () => Promise.resolve(ran()),
    ];
    const run = vi.fn(() => (outcomes.shift() ?? (() => Promise.resolve(ran())))());
    const { logger, calls } = recordingLogger();
    const runner = createJobRunner({ jobs: [job('flaky', run)], logger, clock, timers });

    runner.start();
    await timers.fire();
    await timers.fire();
    expect(runner.status()[0]).toMatchObject({
      failures: 2,
      consecutiveFailures: 2,
      lastOutcome: 'Failed',
      lastError: 'database down',
    });
    expect(calls.filter((call) => call.message === 'Job failed')).toHaveLength(2);
    expect(timers.pending.size).toBe(1);

    await timers.fire();
    expect(runner.status()[0]).toMatchObject({
      failures: 2,
      consecutiveFailures: 0,
      lastOutcome: 'Ran',
      lastError: null,
    });
  });

  it('counts a skipped run apart from a real one and does not log it as activity', async () => {
    const timers = new ManualTimers();
    const { logger, calls } = recordingLogger();
    const runner = createJobRunner({
      jobs: [
        job('shared', () => Promise.resolve({ outcome: 'Skipped', counts: { expiredOrders: 0 } })),
      ],
      logger,
      clock,
      timers,
    });
    runner.start();
    await timers.fire();
    expect(runner.status()[0]).toMatchObject({ runs: 0, skipped: 1, lastOutcome: 'Skipped' });
    expect(calls.some((call) => call.level === 'info' && call.message === 'Job ran')).toBe(false);
  });

  it('records an alert as an error even when the job finished well', async () => {
    const timers = new ManualTimers();
    const { logger, calls } = recordingLogger();
    const runner = createJobRunner({
      jobs: [
        job('watch', () =>
          Promise.resolve({
            outcome: 'Ran',
            counts: { amountDiscrepancies: 3 },
            alert: 'Numbers do not add up',
          }),
        ),
      ],
      logger,
      clock,
      timers,
    });
    runner.start();
    await timers.fire();
    const alert = calls.find((call) => call.message === 'Numbers do not add up');
    expect(alert?.level).toBe('error');
    expect(alert?.context).toMatchObject({ job: 'watch', amountDiscrepancies: 3 });
    expect(runner.status()[0]?.lastOutcome).toBe('Ran');
  });

  it('stops: it cancels what is waiting, waits for what is running and schedules nothing more', async () => {
    const timers = new ManualTimers();
    let release: () => void = () => undefined;
    const slow = vi.fn(
      () =>
        new Promise<JobResult>((resolve) => {
          release = () => {
            resolve(ran());
          };
        }),
    );
    const runner = createJobRunner({
      jobs: [job('slow', slow), job('idle', () => Promise.resolve(ran()), 1000, 50)],
      logger: recordingLogger().logger,
      clock,
      timers,
    });

    runner.start();
    await timers.fire();
    let stopped = false;
    const stopping = runner.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(stopped).toBe(false);
    expect(timers.pending.size).toBe(0);

    release();
    await stopping;
    expect(stopped).toBe(true);
    expect(timers.pending.size).toBe(0);
  });

  it('runs a job on demand once, shares the run in flight and rejects an unknown name', async () => {
    const run = vi.fn(() => Promise.resolve(ran({ purgedIdempotency: 4 })));
    const runner = createJobRunner({
      jobs: [job('purge', run)],
      logger: recordingLogger().logger,
      clock,
      timers: new ManualTimers(),
    });

    const [first, second] = await Promise.all([runner.runNow('purge'), runner.runNow('purge')]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(first.lastCounts).toEqual({ purgedIdempotency: 4 });
    expect(second.runs).toBe(1);
    await expect(runner.runNow('missing')).rejects.toThrow(/Unknown job/);
  });

  it('hands out copies of the status so a caller cannot change the counters', () => {
    const runner = createJobRunner({
      jobs: [job('a', () => Promise.resolve(ran()))],
      logger: recordingLogger().logger,
      clock,
      timers: new ManualTimers(),
    });
    const copy = runner.status()[0];
    if (copy === undefined) throw new Error('missing status');
    copy.runs = 99;
    expect(runner.status()[0]?.runs).toBe(0);
  });
});

/** Los seis contadores de la purga, en cero salvo los que una prueba indique. */
function purged(overrides: Partial<Record<string, number>> = {}) {
  return {
    purgedIdempotency: 0,
    purgedRefreshTokens: 0,
    purgedWebhooks: 0,
    purgedGuestCarts: 0,
    purgedReservations: 0,
    purgedDdlHistory: 0,
    ...overrides,
  };
}

function fakePort(overrides: Partial<JobsPort> = {}): JobsPort {
  return {
    expirePayments: () =>
      Promise.resolve({ outcome: 'Ran', expiredOrders: 3, releasedReservations: 2 }),
    purgeExpired: () => Promise.resolve({ outcome: 'Ran', ...purged({ purgedIdempotency: 7 }) }),
    reconcile: () =>
      Promise.resolve({ outcome: 'Ran', amountDiscrepancies: 0, inventoryDiscrepancies: 0 }),
    ...overrides,
  };
}

describe('job definitions', () => {
  const config = { expireEverySeconds: 60, purgeEveryHours: 24, reconcileEveryHours: 12 };
  const byName = (port: JobsPort) =>
    Object.fromEntries(buildJobs(port, config).map((definition) => [definition.name, definition]));

  it('defines the three Phase 1 jobs with the configured intervals', () => {
    const jobs = buildJobs(fakePort(), config);
    expect(jobs.map((definition) => [definition.name, definition.intervalMs])).toEqual([
      ['expirePayments', 60_000],
      ['purgeExpired', 24 * 3600_000],
      ['reconcileAmounts', 12 * 3600_000],
    ]);
  });

  it('turns what each procedure did into counts', async () => {
    const jobs = byName(fakePort());
    expect(await jobs['expirePayments']?.run()).toEqual({
      outcome: 'Ran',
      counts: { expiredOrders: 3, releasedReservations: 2 },
    });
    expect(await jobs['purgeExpired']?.run()).toEqual({
      outcome: 'Ran',
      counts: purged({ purgedIdempotency: 7 }),
    });
  });

  it('asks the expiry procedure for a bounded batch', async () => {
    const expirePayments = vi.fn(() =>
      Promise.resolve({ outcome: 'Skipped' as const, expiredOrders: 0, releasedReservations: 0 }),
    );
    await byName(fakePort({ expirePayments }))['expirePayments']?.run();
    expect(expirePayments).toHaveBeenCalledWith(100);
  });

  it('raises an alert only when the reconciliation finds a discrepancy', async () => {
    const clean = await byName(fakePort())['reconcileAmounts']?.run();
    expect(clean?.alert).toBeUndefined();
    const dirty = await byName(
      fakePort({
        reconcile: () =>
          Promise.resolve({ outcome: 'Ran', amountDiscrepancies: 1, inventoryDiscrepancies: 2 }),
      }),
    )['reconcileAmounts']?.run();
    expect(dirty?.alert).toMatch(/discrepancies/);
    expect(dirty?.counts).toEqual({ amountDiscrepancies: 1, inventoryDiscrepancies: 2 });
  });
});

describe('SQL jobs adapter', () => {
  it('calls the three job procedures and reads their outcomes', async () => {
    const calls: { procedure: string; inputs: string[]; outputs: string[] }[] = [];
    const execute = ((
      procedure: string,
      params: { name: string }[] = [],
      outputs: { name: string }[] = [],
    ) => {
      calls.push({
        procedure,
        inputs: params.map((p) => p.name),
        outputs: outputs.map((o) => o.name),
      });
      return Promise.resolve({ rows: [], output: { Outcome: 'Skipped' } });
    }) as unknown as ProcedureExecutor;
    const jobs = createSqlJobs(execute);

    expect(await jobs.expirePayments(50)).toEqual({
      outcome: 'Skipped',
      expiredOrders: 0,
      releasedReservations: 0,
    });
    expect(await jobs.purgeExpired()).toEqual({ outcome: 'Skipped', ...purged() });
    expect(await jobs.reconcile()).toEqual({
      outcome: 'Skipped',
      amountDiscrepancies: 0,
      inventoryDiscrepancies: 0,
    });
    expect(calls).toEqual([
      {
        procedure: 'dbo.SP_Jobs_ExpirePayments',
        inputs: ['BatchSize'],
        outputs: ['Outcome', 'ExpiredOrders', 'ReleasedReservations'],
      },
      {
        procedure: 'dbo.SP_Jobs_PurgeExpired',
        inputs: [],
        outputs: [
          'Outcome',
          'PurgedIdempotency',
          'PurgedRefreshTokens',
          'PurgedWebhooks',
          'PurgedGuestCarts',
          'PurgedReservations',
          'PurgedDdlHistory',
        ],
      },
      {
        procedure: 'dbo.SP_Jobs_ReconcileAmounts',
        inputs: [],
        outputs: ['Outcome', 'AmountDiscrepancies', 'InventoryDiscrepancies'],
      },
    ]);
  });
});
