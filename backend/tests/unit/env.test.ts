import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/platform/config/env.js';
import { paymentsEnvSchema } from '../../src/platform/config/payments.js';

const baseEnv = {
  DB_APP_USER: 'shopcart_app',
  DB_APP_PASSWORD: 'secret',
  APP_PUBLIC_URL: 'http://localhost:8080',
};

describe('environment validation', () => {
  it('applies defaults and splits the CORS origins', () => {
    const env = loadEnv({ ...baseEnv, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('treats an empty REQUIRED_SCHEMA_VERSION as not configured', () => {
    expect(
      loadEnv({ ...baseEnv, REQUIRED_SCHEMA_VERSION: '' }).REQUIRED_SCHEMA_VERSION,
    ).toBeUndefined();
  });

  it('fails fast when a required variable is missing', () => {
    expect(() => loadEnv({ APP_PUBLIC_URL: 'http://localhost:8080' })).toThrow(/DB_APP_USER/);
  });
});

describe('payments configuration', () => {
  it('treats blank Recurrente credentials as not configured', () => {
    const parsed = paymentsEnvSchema.parse({
      RECURRENTE_PUBLIC_KEY: '',
      RECURRENTE_SECRET_KEY: ' ',
    });
    expect(parsed.RECURRENTE_PUBLIC_KEY).toBeUndefined();
    expect(parsed.RECURRENTE_SECRET_KEY).toBeUndefined();
  });

  it('rejects a malformed key prefix', () => {
    expect(() => paymentsEnvSchema.parse({ RECURRENTE_PUBLIC_KEY: 'abc' })).toThrow();
  });
});
