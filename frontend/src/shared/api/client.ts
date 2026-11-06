import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

/** Cliente tipado del contrato OpenAPI; la base se parametriza para poder probarlo fuera del navegador. */
export const createApiClient = (baseUrl = '') => createClient<paths>({ baseUrl });

/**
 * Las rutas y los cuerpos salen de `docs/api/openapi/openapi.yaml`, así que un cambio del contrato rompe la compilación
 * aquí antes de llegar al navegador. Mismo origen: nginx reenvía /api al backend, sin CORS.
 */
export const api = createApiClient();
