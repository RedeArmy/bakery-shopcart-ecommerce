import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createErrorHandler } from '../../src/platform/http/error-handler.js';
import { requestId } from '../../src/platform/http/request-id.js';
import { createLogger } from '../../src/platform/logging/logger.js';
import { AppError } from '../../src/shared-kernel/index.js';

const logger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });

const buildApp = (failure: () => never) => {
  const app = express();
  app.use(requestId);
  app.get('/fail', () => {
    failure();
  });
  app.use(createErrorHandler(logger));
  return app;
};

describe('error handler', () => {
  it('serialises an AppError with its status, code and details', async () => {
    const app = buildApp(() => {
      throw new AppError(409, 'INSUFFICIENT_STOCK', 'No units left', { sku: 'PAS-3L-06' });
    });
    const response = await request(app).get('/fail');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'No units left',
        details: { sku: 'PAS-3L-06' },
        requestId: response.headers['x-request-id'] as string,
      },
    });
  });

  it('maps a zod failure to a 400 with one detail per issue', async () => {
    const app = buildApp(() => {
      z.object({ quantity: z.number().int() }).parse({ quantity: 'many' });
      throw new Error('unreachable');
    });
    const response = await request(app).get('/fail');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: [{ path: 'quantity' }] },
    });
  });

  it('hides the detail of an unexpected error and logs it with the request id', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const app = buildApp(() => {
      throw new Error('password=secret leaked in a stack trace');
    });
    const response = await request(app).get('/fail');
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
