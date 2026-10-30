import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared-kernel/index.js';
import type { AccessClaims, RoleName, TokenService } from '../security/tokens.js';

const BEARER = /^Bearer\s+(\S+)$/i;

/** Quien llama, ya verificado: el IDUser sale siempre de aquí y nunca del cuerpo, la ruta o la consulta. */
export function currentUser(req: Request): AccessClaims | undefined {
  return (req.res?.locals['user'] as AccessClaims | undefined) ?? undefined;
}

/** Igual que currentUser pero para rutas protegidas: authenticate ya garantizó que existe. */
export function requireUser(req: Request): AccessClaims {
  const user = currentUser(req);
  if (user === undefined) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
  return user;
}

/** Verifica el access token. Si es opcional, una petición sin token pasa como visitante; uno inválido nunca pasa. */
export function createAuthenticate(
  tokens: TokenService,
  options: { optional?: boolean } = {},
): RequestHandler {
  return async (req, res, next) => {
    const header = req.header('Authorization');
    if (header === undefined) {
      if (options.optional === true) {
        next();
        return;
      }
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
    }
    const token = BEARER.exec(header)?.[1];
    const claims = token === undefined ? null : await tokens.verifyAccess(token);
    if (claims === null)
      throw new AppError(401, 'TOKEN_INVALID', 'The access token is invalid or expired');
    res.locals['user'] = claims;
    next();
  };
}

/** 403 cuando el rol no alcanza; 401 es solo para token ausente o vencido. */
export function requireRole(...roles: RoleName[]): RequestHandler {
  return (req, _res, next) => {
    const user = requireUser(req);
    if (!roles.includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'The role is not allowed to do this');
    }
    next();
  };
}
