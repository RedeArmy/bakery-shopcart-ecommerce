import { describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config.js';

const base = { SQL_TEST_PASSWORD: 'not-a-real-password' };

describe('loadConfig', () => {
  it('applies local defaults', () => {
    expect(loadConfig(base)).toMatchObject({
      host: 'localhost',
      port: 14333,
      user: 'sa',
      database: 'ShopCart_CI',
      reportPath: 'test-results/tsqlt-junit.xml',
    });
  });

  it('falls back to MSSQL_SA_PASSWORD', () => {
    expect(loadConfig({ MSSQL_SA_PASSWORD: 'fallback' }).password).toBe('fallback');
  });

  it('requires a password', () => {
    expect(() => loadConfig({})).toThrow(/SQL_TEST_PASSWORD/);
  });

  it('refuses a remote host unless explicitly allowed', () => {
    expect(() => loadConfig({ ...base, SQL_TEST_HOST: 'db.example.com' })).toThrow(/Refusing/);
    expect(
      loadConfig({ ...base, SQL_TEST_HOST: 'db.example.com', SQL_TEST_ALLOW_REMOTE: 'true' }).host,
    ).toBe('db.example.com');
  });

  it('refuses a database whose name does not end in _CI', () => {
    expect(() => loadConfig({ ...base, SQL_TEST_DATABASE: 'ShopCart' })).toThrow(/_CI/);
    expect(() => loadConfig({ ...base, SQL_TEST_DATABASE: 'x]; DROP DATABASE y;--_CI' })).toThrow(
      /_CI/,
    );
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...base, SQL_TEST_PORT: 'abc' })).toThrow(/SQL_TEST_PORT/);
    expect(() => loadConfig({ ...base, SQL_TEST_PORT: '70000' })).toThrow(/SQL_TEST_PORT/);
  });
});
