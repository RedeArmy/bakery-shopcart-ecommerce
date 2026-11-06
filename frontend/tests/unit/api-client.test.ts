import { describe, expect, it } from 'vitest';
import { createApiClient } from '../../src/shared/api/client';

describe('API client generated from the OpenAPI contract', () => {
  it('calls a route of the contract with the typed path and reads the typed answer', async () => {
    const requested: string[] = [];
    // Se inyecta fetch para no salir a la red; la ruta solo compila si existe en el contrato
    const fetch = (request: Request): Promise<Response> => {
      requested.push(`${request.method} ${new URL(request.url).pathname}`);
      return Promise.resolve(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };

    const api = createApiClient('http://localhost');
    const result = await api.GET('/api/v1/categories', { fetch });

    expect(requested).toEqual(['GET /api/v1/categories']);
    expect(result.response.status).toBe(200);
    expect(result.error).toBeUndefined();
  });
});
