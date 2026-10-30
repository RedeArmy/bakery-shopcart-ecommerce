import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/platform/http/app.js';
import type { ReadinessReport } from '../../src/platform/http/readiness.js';
import { createLogger } from '../../src/platform/logging/logger.js';

const logger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });

const ready: ReadinessReport = { database: 'up', schema: 'ok' };

const buildApp = (report: ReadinessReport = ready) =>
  createApp({
    env: { CORS_ORIGINS: ['http://localhost:8080'] },
    logger,
    health: { checkReadiness: () => Promise.resolve(report) },
  });

describe('health endpoints', () => {
  it('GET /health/live answers 200 without touching the database', async () => {
    const response = await request(buildApp({ database: 'down', schema: 'unknown' })).get(
      '/health/live',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready answers 200 when the database is reachable and the schema is current', async () => {
    const response = await request(buildApp()).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', checks: { database: 'up', schema: 'ok' } });
  });

  it('GET /health/ready answers 503 when the database is down', async () => {
    const response = await request(buildApp({ database: 'down', schema: 'unknown' })).get(
      '/health/ready',
    );
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'unavailable', checks: { database: 'down' } });
  });

  it('GET /health/ready answers 503 when the schema is behind the code', async () => {
    const response = await request(buildApp({ database: 'up', schema: 'outdated' })).get(
      '/health/ready',
    );
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      checks: { database: 'up', schema: 'outdated' },
    });
  });

  it('GET /health/ready never exposes version numbers', async () => {
    const response = await request(buildApp({ database: 'up', schema: 'outdated' })).get(
      '/health/ready',
    );
    expect(JSON.stringify(response.body)).not.toMatch(/\d/);
  });

  it('returns the standard error shape for unknown routes', async () => {
    const response = await request(buildApp()).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: { code: 'ROUTE_NOT_FOUND', requestId: expect.any(String) as string },
    });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('returns INVALID_JSON for a malformed body', async () => {
    const response = await request(buildApp())
      .post('/health/live')
      .set('Content-Type', 'application/json')
      .send('{ broken');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
  });
});
