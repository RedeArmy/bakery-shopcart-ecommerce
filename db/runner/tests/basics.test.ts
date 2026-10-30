import { describe, expect, it } from 'vitest';
import { splitBatches } from '../src/batches.js';
import { checksumOf, normalise } from '../src/checksum.js';
import { loadRunnerConfig } from '../src/config.js';
import { compareVersions, parseVersion } from '../src/semver.js';

describe('checksumOf', () => {
  it('gives the same checksum for CRLF, LF and a byte order mark', () => {
    const lf = 'SELECT 1;\nGO\n';
    expect(checksumOf('SELECT 1;\r\nGO\r\n')).toBe(checksumOf(lf));
    expect(checksumOf(String.fromCodePoint(0xfeff) + lf)).toBe(checksumOf(lf));
  });

  it('changes when the content changes', () => {
    expect(checksumOf('SELECT 1;')).not.toBe(checksumOf('SELECT 2;'));
  });

  it('is a 64 character hexadecimal digest', () => {
    expect(checksumOf('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalises lone carriage returns', () => {
    expect(normalise('a\rb')).toBe('a\nb');
  });
});

describe('versions', () => {
  it('parses x.y.z and rejects anything else', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2')).toBeUndefined();
    expect(parseVersion('1.2.x')).toBeUndefined();
    expect(parseVersion('1.2.3.4')).toBeUndefined();
  });

  it('compares numerically, not alphabetically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });

  it('throws on an invalid version', () => {
    expect(() => compareVersions('a', '1.0.0')).toThrow(/Invalid version/);
  });
});

describe('splitBatches', () => {
  it('splits on GO lines and drops empty batches', () => {
    expect(splitBatches('SELECT 1;\n  go \nSELECT 2;\nGO\n\nGO\n')).toEqual([
      'SELECT 1;',
      'SELECT 2;',
    ]);
  });

  it('keeps GO when it is part of another word', () => {
    expect(splitBatches('SELECT 1 AS GOAL;')).toEqual(['SELECT 1 AS GOAL;']);
  });
});

describe('loadRunnerConfig', () => {
  const base = { MSSQL_SA_PASSWORD: 'not-a-real-password' };

  it('applies defaults', () => {
    expect(loadRunnerConfig(base)).toMatchObject({
      host: 'localhost',
      port: 1433,
      user: 'sa',
      database: 'ShopCart',
    });
  });

  it('prefers MIGRATION_PASSWORD', () => {
    expect(loadRunnerConfig({ ...base, MIGRATION_PASSWORD: 'other' }).password).toBe('other');
  });

  it('requires a password and a valid database and port', () => {
    expect(() => loadRunnerConfig({})).toThrow(/MSSQL_SA_PASSWORD/);
    expect(() => loadRunnerConfig({ ...base, DB_NAME: 'a]; DROP' })).toThrow(/DB_NAME/);
    expect(() => loadRunnerConfig({ ...base, DB_PORT: '0' })).toThrow(/port/);
  });

  it('lets MIGRATION_HOST and MIGRATION_PORT override DB_HOST and DB_PORT', () => {
    const config = loadRunnerConfig({
      ...base,
      DB_HOST: 'db',
      DB_PORT: '1433',
      MIGRATION_HOST: 'localhost',
      MIGRATION_PORT: '14333',
    });
    expect(config).toMatchObject({ host: 'localhost', port: 14333 });
  });
});
