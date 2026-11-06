import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

/**
 * Cliente tipado del contrato OpenAPI. Las rutas y los cuerpos salen de `docs/api/openapi/openapi.yaml`, así que un cambio
 * del contrato rompe la compilación aquí antes de llegar al navegador. La base y el `fetch` se parametrizan para poder
 * probarlo fuera del navegador y para que la sesión intercepte las llamadas.
 */
export const createApiClient = (baseUrl = '', fetchImpl?: typeof fetch) =>
  createClient<paths>(fetchImpl === undefined ? { baseUrl } : { baseUrl, fetch: fetchImpl });

export type ApiClient = ReturnType<typeof createApiClient>;
