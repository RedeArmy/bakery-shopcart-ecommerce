import request from 'supertest';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { requestId } from '../../src/platform/http/request-id.js';

const buildApp = () => {
  const app = express();
  app.use(requestId);
  app.get('/echo', (_req, res) => {
    res.json({ requestId: res.locals['requestId'] as string });
  });
  return app;
};

describe('requestId middleware', () => {
  it('generates an identifier when the client sends none', async () => {
    const response = await request(buildApp()).get('/echo');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body).toEqual({ requestId: response.headers['x-request-id'] });
  });

  it('keeps a well-formed identifier sent by the client', async () => {
    const response = await request(buildApp()).get('/echo').set('X-Request-Id', 'client-id-12345');
    expect(response.headers['x-request-id']).toBe('client-id-12345');
  });

  it('replaces an identifier with an unsafe shape', async () => {
    const response = await request(buildApp()).get('/echo').set('X-Request-Id', 'bad id!');
    expect(response.headers['x-request-id']).not.toBe('bad id!');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
