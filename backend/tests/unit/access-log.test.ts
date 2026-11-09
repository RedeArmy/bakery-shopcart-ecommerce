import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createAccessLog } from '../../src/platform/http/access-log.js';
import { requestId } from '../../src/platform/http/request-id.js';
import type { Logger } from '../../src/platform/logging/logger.js';

const fakeLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

/** Express reconoce un manejador de errores por sus cuatro parámetros, aunque el último no se use. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const failWithJson: express.ErrorRequestHandler = (_error, _req, res, _next) => {
  res.status(500).json({ ok: false });
};

/** Una aplicación mínima con el requestId, el registro de accesos y rutas que responden lo que cada prueba necesita. */
function appWith(logger: ReturnType<typeof fakeLogger>) {
  const app = express();
  app.use(requestId);
  app.use(createAccessLog(logger as unknown as Logger));
  const api = express.Router();
  api.get('/orders/:id', (_req, res) => {
    res.json({ ok: true });
  });
  api.get('/broken', (_req, res) => {
    res.status(500).json({ ok: false });
  });
  api.get('/explodes', (_req, _res, next) => {
    next(new Error('boom'));
  });
  api.get('/missing', (_req, res) => {
    res.status(404).json({ ok: false });
  });
  app.use('/api/v1', api);
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // Como el manejador de errores de la aplicación: responde cuando el router ya se desenrolló
  app.use(failWithJson);
  return app;
}

const loggedFields = (call: unknown[]): Record<string, unknown> =>
  call[0] as Record<string, unknown>;

describe('access log', () => {
  it('writes one line per request with the method, the route, the status and the duration', async () => {
    const logger = fakeLogger();
    await request(appWith(logger)).get('/api/v1/orders/42?token=secret').expect(200);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const fields = loggedFields(logger.info.mock.calls[0] ?? []);
    expect(fields).toMatchObject({ method: 'GET', route: '/api/v1/orders/:id', status: 200 });
    expect(typeof fields['durationMs']).toBe('number');
    expect(fields['durationMs']).toBeGreaterThanOrEqual(0);
    expect(logger.info.mock.calls[0]?.[1]).toBe('request');
  });

  it('logs the route template and never the identifier or the query string', async () => {
    const logger = fakeLogger();
    await request(appWith(logger)).get('/api/v1/orders/42?email=ana@shopcart.test');

    const serialised = JSON.stringify(logger.info.mock.calls);
    // El requestId es un UUID al azar y puede contener «42»: se busca el identificador dentro de la ruta, no suelto
    expect(serialised).toContain('/api/v1/orders/:id');
    expect(serialised).not.toContain('/orders/42');
    expect(serialised).not.toContain('ana@shopcart.test');
    expect(serialised).not.toContain('token');
  });

  it('carries the same requestId as the response header', async () => {
    const logger = fakeLogger();
    const response = await request(appWith(logger)).get('/api/v1/orders/1');

    expect(loggedFields(logger.info.mock.calls[0] ?? [])['requestId']).toBe(
      response.header['x-request-id'],
    );
  });

  it('reports a client error as a warning and a server error as an error', async () => {
    const logger = fakeLogger();
    const app = appWith(logger);
    await request(app).get('/api/v1/missing');
    await request(app).get('/api/v1/broken');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(loggedFields(logger.warn.mock.calls[0] ?? [])).toMatchObject({ status: 404 });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(loggedFields(logger.error.mock.calls[0] ?? [])).toMatchObject({ status: 500 });
  });

  it('keeps the whole route when the response comes out of the error handler', async () => {
    const logger = fakeLogger();
    await request(appWith(logger)).get('/api/v1/explodes').expect(500);

    expect(loggedFields(logger.error.mock.calls[0] ?? [])).toMatchObject({
      route: '/api/v1/explodes',
      status: 500,
    });
  });

  it('calls an address that no route attended unmatched', async () => {
    const logger = fakeLogger();
    await request(appWith(logger)).get('/nothing-here/123');

    expect(loggedFields(logger.warn.mock.calls[0] ?? [])).toMatchObject({ route: 'unmatched' });
  });

  it('keeps the health probes at the debug level', async () => {
    const logger = fakeLogger();
    await request(appWith(logger)).get('/health/live').expect(200);

    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
