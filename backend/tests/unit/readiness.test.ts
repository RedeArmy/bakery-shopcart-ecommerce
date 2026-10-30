import { describe, expect, it, vi } from 'vitest';
import { createReadiness } from '../../src/platform/http/readiness.js';
import { createLogger } from '../../src/platform/logging/logger.js';

const logger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });

interface Setup {
  connected?: boolean;
  version?: number | Error;
  required?: number;
}

function build({ connected = true, version = 10, required = 10 }: Setup = {}) {
  const checkConnection = vi.fn(() => Promise.resolve(connected));
  const readSchemaVersion = vi.fn(() =>
    version instanceof Error ? Promise.reject(version) : Promise.resolve(version),
  );
  const readiness = createReadiness({
    checkConnection,
    readSchemaVersion,
    requiredSchemaVersion: required,
    logger,
  });
  return { readiness, checkConnection, readSchemaVersion };
}

describe('readiness', () => {
  it('is ready when the database answers and the schema meets the requirement', async () => {
    const { readiness } = build({ version: 10, required: 10 });
    expect(await readiness()).toEqual({ database: 'up', schema: 'ok' });
  });

  it('accepts a schema that is ahead of what the code needs', async () => {
    const { readiness } = build({ version: 12, required: 10 });
    expect(await readiness()).toEqual({ database: 'up', schema: 'ok' });
  });

  it('is not ready when the schema is behind the code', async () => {
    const { readiness } = build({ version: 9, required: 10 });
    expect(await readiness()).toEqual({ database: 'up', schema: 'outdated' });
  });

  it('reports the database as down without reading the schema', async () => {
    const { readiness, readSchemaVersion } = build({ connected: false });
    expect(await readiness()).toEqual({ database: 'down', schema: 'unknown' });
    expect(readSchemaVersion).not.toHaveBeenCalled();
  });

  it('reports the schema as unknown when the version cannot be read', async () => {
    const { readiness } = build({ version: new Error('procedure not found') });
    expect(await readiness()).toEqual({ database: 'up', schema: 'unknown' });
  });

  it('remembers a satisfied requirement and stops querying the schema', async () => {
    const { readiness, readSchemaVersion, checkConnection } = build();
    await readiness();
    await readiness();
    await readiness();
    expect(readSchemaVersion).toHaveBeenCalledTimes(1);
    // La conexión sí se comprueba en cada sonda: la base puede caerse en cualquier momento
    expect(checkConnection).toHaveBeenCalledTimes(3);
  });

  it('keeps checking while the schema is behind, so it recovers after the migration', async () => {
    const { readiness, readSchemaVersion } = build({ version: 9 });
    expect((await readiness()).schema).toBe('outdated');
    readSchemaVersion.mockResolvedValueOnce(10);
    expect((await readiness()).schema).toBe('ok');
    expect(readSchemaVersion).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failed reading', async () => {
    const { readiness, readSchemaVersion } = build({ version: new Error('boom') });
    await readiness();
    readSchemaVersion.mockResolvedValueOnce(10);
    expect((await readiness()).schema).toBe('ok');
  });
});
