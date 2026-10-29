import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/platform/http/app.js';
import { createLogger } from '../../src/platform/logging/logger.js';

const logger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });

const buildApp = (databaseReady: boolean) =>
  createApp({
    env: { CORS_ORIGINS: ['http://localhost:8080'] },
    logger,
    health: { isDatabaseReady: () => Promise.resolve(databaseReady) },
  });

describe('health endpoints', () => {
  it('GET /health/live answers 200 without touching the database', async () => {
    const response = await request(buildApp(false)).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready answers 200 when the database is reachable', async () => {
    const response = await request(buildApp(true)).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ checks: { database: 'up' } });
  });

  it('GET /health/ready answers 503 when the database is down', async () => {
    const response = await request(buildApp(false)).get('/health/ready');
    expect(response.status).toBe(503);
  });

  it('returns the standard error shape for unknown routes', async () => {
    const response = await request(buildApp(true)).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: { code: 'ROUTE_NOT_FOUND', requestId: expect.any(String) as string },
    });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('returns INVALID_JSON for a malformed body', async () => {
    const response = await request(buildApp(true))
      .post('/health/live')
      .set('Content-Type', 'application/json')
      .send('{ broken');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
  });
});
