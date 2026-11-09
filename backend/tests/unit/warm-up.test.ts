import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../../src/platform/db/pool.js';
import { createWarmUp } from '../../src/platform/db/warm-up.js';
import { createLogger } from '../../src/platform/logging/logger.js';

const logger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });

describe('database warm-up', () => {
  it('runs the warm-up procedure', async () => {
    const execute = vi.fn(() =>
      Promise.resolve({ rows: [{ LocalToday: '2030-06-01' }], output: {} }),
    );
    const warmUp = createWarmUp({} as Database, logger, (() => execute) as never);

    await warmUp();

    expect(execute).toHaveBeenCalledWith('dbo.SP_System_WarmUp');
  });

  it('never rejects: a failure is logged and the service carries on', async () => {
    const execute = vi.fn(() => Promise.reject(new Error('database down')));
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const warmUp = createWarmUp({} as Database, logger, () => execute);

    await expect(warmUp()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
