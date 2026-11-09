import type { Request, RequestHandler } from 'express';
import type { Logger } from '../logging/logger.js';
import { currentUser } from './authentication.js';

/** El prefijo con que se monta la API: se declara aquí porque el registro lo necesita y app.ts lo usa para montarla. */
export const API_BASE = '/api/v1';

/** Las sondas de salud llegan cada pocos segundos: se registran en el nivel de depuración para no llenar el registro. */
const isProbe = (route: string): boolean => route.startsWith('/health');

/**
 * La ruta como la declaró el módulo (`/api/v1/orders/:id`) y no la dirección real: así los identificadores y la cadena de consulta
 * nunca llegan al registro y todas las peticiones de una misma ruta se agrupan. Una dirección que ninguna ruta atendió es `unmatched`.
 */
const routeOf = (req: Request): string => {
  const path: unknown = req.route && (req.route as { path?: unknown }).path;
  if (typeof path !== 'string') return 'unmatched';
  // Cuando la respuesta sale por el manejador de errores Express ya devolvió `baseUrl` a vacío: se recupera por el prefijo
  const mounted = req.originalUrl.startsWith(`${API_BASE}/`) ? API_BASE : '';
  return `${req.baseUrl === '' ? mounted : req.baseUrl}${path}`;
};

/**
 * Deja un renglón por petición al terminar: método, ruta, estado, duración, quién la hizo y su requestId, el mismo que lleva la
 * respuesta y el error, para correlacionarlos. Un 5xx es error, un 4xx aviso y el resto información.
 */
export function createAccessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1_000_000);
      const route = routeOf(req);
      const id: unknown = res.locals['requestId'];
      const fields = {
        requestId: typeof id === 'string' ? id : undefined,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs,
        userId: currentUser(req)?.idUser,
      };
      if (isProbe(route)) logger.debug(fields, 'request');
      else if (res.statusCode >= 500) logger.error(fields, 'request');
      else if (res.statusCode >= 400) logger.warn(fields, 'request');
      else logger.info(fields, 'request');
    });
    next();
  };
}
