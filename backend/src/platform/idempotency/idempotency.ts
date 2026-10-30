import { createHash } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../shared-kernel/index.js';
import { currentUser } from '../http/authentication.js';
import type { Logger } from '../logging/logger.js';

export interface IdempotencyRequest {
  scope: string;
  method: string;
  route: string;
  key: string;
}

export type BeginOutcome = 'New' | 'TakenOver' | 'Replay' | 'InProgress' | 'Mismatch';

export interface BeginResult {
  outcome: BeginOutcome;
  httpStatus: number | null;
  responseBody: string | null;
  retryAfterSeconds: number | null;
}

/** Puerto del primer nivel de idempotencia (ADR-0004); el adaptador SQL llama a SP_Idempotency_*. */
export interface IdempotencyStorePort {
  begin(request: IdempotencyRequest & { requestHash: string }): Promise<BeginResult>;
  complete(request: IdempotencyRequest & { httpStatus: number; body: string }): Promise<void>;
  fail(request: IdempotencyRequest): Promise<void>;
}

// Se rechaza aquí para dar un mensaje claro en vez del 400 genérico de la base de datos
const KEY_FORMAT = /^[\w-]{8,64}$/;
const MAX_ROUTE_LENGTH = 200;
const CART_TOKEN_HEADER = 'X-Cart-Token';

/** El ámbito aísla las llaves entre personas: U:<id> para una cuenta y G:<token> para un visitante. */
function scopeOf(req: Request): string | undefined {
  const user = currentUser(req);
  if (user !== undefined) return `U:${user.idUser}`;
  const guest = req.header(CART_TOKEN_HEADER);
  return guest === undefined || guest === '' ? undefined : `G:${guest}`;
}

/** La huella cubre método, ruta con parámetros y cuerpo: la misma llave con otro contenido es un error, no un reintento. */
export function requestHash(req: Request): string {
  const path = req.originalUrl.split('?')[0] ?? '';
  const body = JSON.stringify(req.body ?? {});
  // En una subida multipart la huella cubre los campos de texto y la del archivo (docs/api/conventions.md)
  const file =
    req.file === undefined ? '' : createHash('sha256').update(req.file.buffer).digest('hex');
  return createHash('sha256').update(`${req.method}\n${path}\n${body}\n${file}`).digest('hex');
}

/**
 * La respuesta se guarda ANTES de enviarla: así un reintento inmediato del cliente ya encuentra el resultado.
 * Un 5xx no se guarda y libera la llave para poder reintentar.
 */
function captureOutcome(
  res: Response,
  identity: IdempotencyRequest,
  store: IdempotencyStorePort,
  logger: Logger,
): void {
  const send = res.json.bind(res);
  let captured = false;
  res.json = (body: unknown) => {
    if (captured) return send(body);
    captured = true;
    const status = res.statusCode;
    const persist =
      status >= 200 && status < 500
        ? store.complete({ ...identity, httpStatus: status, body: JSON.stringify(body ?? null) })
        : store.fail(identity);
    persist
      .catch((error: unknown) => {
        // Un fallo al guardar no debe perder la respuesta ya calculada; la llave se recupera sola a los 60 s
        logger.error(
          { err: error, scope: identity.scope },
          'Could not store the idempotent response',
        );
      })
      .finally(() => {
        send(body);
      });
    return res;
  };
}

/**
 * Middleware de idempotencia. Va en la ruta, después de la autenticación, para conocer el ámbito y el patrón de la ruta.
 * Con `required` la llave es obligatoria; sin ella solo se respeta si el cliente la envía (PUT y DELETE).
 */
export function createIdempotency(store: IdempotencyStorePort, logger: Logger) {
  return function idempotent(options: { required: boolean }): RequestHandler {
    return async (req, res, next) => {
      const key = req.header('Idempotency-Key');
      if (key === undefined || key === '') {
        if (options.required) {
          throw new AppError(
            400,
            'IDEMPOTENCY_KEY_REQUIRED',
            'The Idempotency-Key header is required',
          );
        }
        next();
        return;
      }
      if (!KEY_FORMAT.test(key)) {
        throw new AppError(
          400,
          'IDEMPOTENCY_KEY_INVALID',
          'The Idempotency-Key must have 8 to 64 letters, digits, hyphens or underscores',
        );
      }
      const scope = scopeOf(req);
      if (scope === undefined) {
        throw new AppError(
          400,
          'IDEMPOTENCY_SCOPE_MISSING',
          'An idempotent request needs a session or a cart token',
        );
      }
      const identity: IdempotencyRequest = {
        scope,
        method: req.method,
        route:
          `${req.baseUrl}${(req.route as { path?: string } | undefined)?.path ?? req.path}`.slice(
            0,
            MAX_ROUTE_LENGTH,
          ),
        key,
      };

      const begun = await store.begin({ ...identity, requestHash: requestHash(req) });
      if (begun.outcome === 'Mismatch') {
        throw new AppError(
          422,
          'IDEMPOTENCY_KEY_REUSED',
          'The key was already used with a different request',
        );
      }
      if (begun.outcome === 'InProgress') {
        res.setHeader('Retry-After', String(begun.retryAfterSeconds ?? 1));
        throw new AppError(409, 'REQUEST_IN_PROGRESS', 'The same request is still being processed');
      }
      if (begun.outcome === 'Replay') {
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(begun.httpStatus ?? 200).json(JSON.parse(begun.responseBody ?? 'null'));
        return;
      }

      captureOutcome(res, identity, store, logger);
      next();
    };
  };
}
