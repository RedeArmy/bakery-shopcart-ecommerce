import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../../src/platform/db/pool.js';
import {
  REQUIRED_SCHEMA_VERSION,
  createSchemaVersionReader,
} from '../../src/platform/db/schema-version.js';

describe('schema version reader', () => {
  it('reads the version through the stored procedure', async () => {
    const execute = vi.fn(() => Promise.resolve({ rows: [{ SchemaVersion: 10 }], output: {} }));
    const read = createSchemaVersionReader({} as Database, (() => execute) as never);

    expect(await read()).toBe(10);
    expect(execute).toHaveBeenCalledWith('dbo.SP_System_GetSchemaVersion');
  });

  it('fails when the procedure returns nothing usable', async () => {
    const execute = vi.fn(() => Promise.resolve({ rows: [], output: {} }));
    const read = createSchemaVersionReader({} as Database, () => execute);
    await expect(read()).rejects.toThrow(/no version/);
  });
});

describe('required schema version', () => {
  const migrations = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');
  const latest = Math.max(
    ...readdirSync(migrations)
      .map((file) => /^V(\d{4})__/.exec(file)?.[1])
      .filter((digits): digits is string => digits !== undefined)
      .map(Number),
  );

  // Exigir una migración que no existe dejaría el servicio sin atender tráfico para siempre
  it('never asks for a migration that does not exist', () => {
    expect(Number.isInteger(REQUIRED_SCHEMA_VERSION)).toBe(true);
    expect(REQUIRED_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(REQUIRED_SCHEMA_VERSION).toBeLessThanOrEqual(latest);
  });
});
