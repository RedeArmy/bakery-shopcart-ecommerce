import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/platform/config/env.js';
import { paymentsEnvSchema } from '../../src/platform/config/payments.js';

const baseEnv = {
  DB_APP_USER: 'shopcart_app',
  DB_APP_PASSWORD: 'secret',
  APP_PUBLIC_URL: 'http://localhost:8080',
  JWT_ACCESS_SECRET: 'a-test-secret-of-sufficient-length',
  JWT_REFRESH_PEPPER: 'a-test-pepper-of-sufficient-length',
};

describe('environment validation', () => {
  it('applies defaults and splits the CORS origins', () => {
    const env = loadEnv({ ...baseEnv, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('reads DB_TRUST_SERVER_CERTIFICATE as a boolean and treats blank as not set', () => {
    expect(loadEnv(baseEnv).DB_TRUST_SERVER_CERTIFICATE).toBeUndefined();
    expect(
      loadEnv({ ...baseEnv, DB_TRUST_SERVER_CERTIFICATE: '' }).DB_TRUST_SERVER_CERTIFICATE,
    ).toBeUndefined();
    expect(
      loadEnv({ ...baseEnv, DB_TRUST_SERVER_CERTIFICATE: 'false' }).DB_TRUST_SERVER_CERTIFICATE,
    ).toBe(false);
    expect(
      loadEnv({ ...baseEnv, DB_TRUST_SERVER_CERTIFICATE: 'true' }).DB_TRUST_SERVER_CERTIFICATE,
    ).toBe(true);
  });

  it('configures the jobs: enabled every minute by default, blank means default and the limits are enforced', () => {
    const defaults = loadEnv(baseEnv);
    expect([
      defaults.JOBS_ENABLED,
      defaults.JOB_EXPIRE_SECONDS,
      defaults.JOB_PURGE_HOURS,
      defaults.JOB_RECONCILE_HOURS,
    ]).toEqual([true, 60, 24, 24]);
    const blank = loadEnv({ ...baseEnv, JOBS_ENABLED: '', JOB_EXPIRE_SECONDS: ' ' });
    expect([blank.JOBS_ENABLED, blank.JOB_EXPIRE_SECONDS]).toEqual([true, 60]);
    expect(loadEnv({ ...baseEnv, JOBS_ENABLED: 'false' }).JOBS_ENABLED).toBe(false);
    expect(loadEnv({ ...baseEnv, JOB_EXPIRE_SECONDS: '30' }).JOB_EXPIRE_SECONDS).toBe(30);
    expect(() => loadEnv({ ...baseEnv, JOB_EXPIRE_SECONDS: '1' })).toThrow(/JOB_EXPIRE_SECONDS/);
    expect(() => loadEnv({ ...baseEnv, JOB_PURGE_HOURS: '0' })).toThrow(/JOB_PURGE_HOURS/);
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
