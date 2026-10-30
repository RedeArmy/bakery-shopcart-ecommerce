import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildContainer } from '../../src/composition-root.js';
import { loadEnv } from '../../src/platform/config/env.js';

const env = loadEnv({
  NODE_ENV: 'test',
  DB_APP_USER: 'shopcart_app',
  DB_APP_PASSWORD: 'secret',
  APP_PUBLIC_URL: 'http://localhost:8080',
  JWT_ACCESS_SECRET: 'a-test-secret-of-sufficient-length',
  JWT_REFRESH_PEPPER: 'a-test-pepper-of-sufficient-length',
});

describe('composition root', () => {
  it('wires the platform into a working application without connecting to the database', async () => {
    const container = buildContainer(env);

    const response = await request(container.app).get('/health/live');

    expect(response.status).toBe(200);
    expect(container.logger).toBeDefined();
    expect(typeof container.database.close).toBe('function');
  });
});
