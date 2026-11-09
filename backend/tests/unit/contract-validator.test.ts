import { describe, expect, it } from 'vitest';
import { createContract, createRecorder } from '../support/contract.js';

/** Un contrato pequeño con lo que el validador tiene que entender: referencias, nulos, fechas, rutas con parámetros y un ciclo. */
const contract = createContract({
  paths: {
    '/api/v1/orders/track': {
      get: {
        responses: {
          '200': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Track' } } },
          },
        },
      },
    },
    '/api/v1/orders/{id}': {
      get: {
        responses: {
          '200': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: { responses: { '204': { description: 'Gone' } } },
    },
    '/api/v1/tree': {
      get: {
        responses: {
          default: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } },
          },
        },
      },
    },
  },
  components: {
    responses: {
      NotFound: {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    schemas: {
      Track: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } },
      Money: { type: 'string', pattern: '^\\d{1,16}\\.\\d{2}$' },
      Order: {
        type: 'object',
        required: ['idOrder', 'total', 'createdAt'],
        properties: {
          idOrder: { type: 'integer', minimum: 1 },
          total: { $ref: '#/components/schemas/Money' },
          createdAt: { type: 'string', format: 'date-time' },
          deliveryDate: { type: 'string', format: 'date', nullable: true },
          paidAmount: { allOf: [{ $ref: '#/components/schemas/Money' }], nullable: true },
        },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'object', required: ['code'] } },
      },
      Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
    },
  },
} as never);

const order = { idOrder: 7, total: '145.00', createdAt: '2030-06-01T15:00:00Z' };
const ok = (path: string, body: unknown, status = 200, method = 'GET') =>
  contract.check({ method, path, status, body });

describe('contract validator', () => {
  it('accepts a response that has the shape of its schema', () => {
    expect(ok('/api/v1/orders/7', order)).toBeNull();
    expect(ok('/api/v1/orders/7', { ...order, deliveryDate: '2030-06-10' })).toBeNull();
    // Un valor nulo solo se admite donde el contrato lo declara
    expect(ok('/api/v1/orders/7', { ...order, deliveryDate: null })).toBeNull();
  });

  it('admits null where a referenced schema is wrapped in allOf and marked nullable', () => {
    expect(ok('/api/v1/orders/7', { ...order, paidAmount: null })).toBeNull();
    expect(ok('/api/v1/orders/7', { ...order, paidAmount: '10.00' })).toBeNull();
    expect(ok('/api/v1/orders/7', { ...order, paidAmount: '10' })).toMatch(/paidAmount/);
  });

  it('says which field breaks the contract', () => {
    expect(ok('/api/v1/orders/7', { idOrder: 7, total: '145.00' })).toMatch(/createdAt/);
    expect(ok('/api/v1/orders/7', { ...order, idOrder: '7' })).toMatch(/idOrder.*integer/);
    expect(ok('/api/v1/orders/7', { ...order, total: 145 })).toMatch(/total.*string/);
  });

  it('holds the amounts to their text form and the dates to their format', () => {
    expect(ok('/api/v1/orders/7', { ...order, total: '145.5' })).toMatch(/total.*pattern/);
    expect(ok('/api/v1/orders/7', { ...order, createdAt: 'yesterday' })).toMatch(
      /createdAt.*format/,
    );
    expect(ok('/api/v1/orders/7', { ...order, deliveryDate: '10/06/2030' })).toMatch(
      /deliveryDate/,
    );
  });

  it('reads the response of a status through its reference', () => {
    expect(ok('/api/v1/orders/9', { error: { code: 'NOT_FOUND' } }, 404)).toBeNull();
    expect(ok('/api/v1/orders/9', { message: 'no' }, 404)).toMatch(/error/);
  });

  it('refuses a status that the contract does not document', () => {
    expect(ok('/api/v1/orders/7', order, 500)).toBe(
      'GET /api/v1/orders/{id}: the status 500 is not documented',
    );
  });

  it('accepts any status that the operation covers with a default response', () => {
    expect(ok('/api/v1/tree', { next: { next: {} } }, 418)).toBeNull();
    // Un esquema que se refiere a sí mismo no se desenrolla sin fin: la referencia circular se corta y deja de comprobar ahí
    expect(ok('/api/v1/tree', 'text', 200)).toMatch(/object/);
  });

  it('refuses a call that no operation matches', () => {
    expect(ok('/api/v1/nothing', {})).toMatch(/no operation/);
    expect(ok('/api/v1/orders/7', order, 200, 'PATCH')).toMatch(/no operation/);
  });

  it('prefers the most specific route', () => {
    // `/orders/track` también encaja con `/orders/{id}`: gana la que no lleva parámetros
    expect(ok('/api/v1/orders/track', { status: 'ok' })).toBeNull();
    expect(ok('/api/v1/orders/track', order)).toMatch(/status/);
  });

  it('does not check a body when the response has none to check', () => {
    expect(ok('/api/v1/orders/7', undefined, 204, 'DELETE')).toBeNull();
  });
});

describe('response recorder', () => {
  it('records what each call answered, without the query string, and leaves the answer untouched', () => {
    const recorder = createRecorder();
    const sent: unknown[] = [];
    const response = {
      statusCode: 201,
      json: (body?: unknown) => {
        sent.push(body);
        return response;
      },
    };

    recorder.middleware(
      { method: 'POST', originalUrl: '/api/v1/orders?token=secret' },
      response,
      () => undefined,
    );
    response.json({ ok: true });

    expect(sent).toEqual([{ ok: true }]);
    expect(recorder.responses).toEqual([
      { method: 'POST', path: '/api/v1/orders', status: 201, body: { ok: true } },
    ]);
  });
});
