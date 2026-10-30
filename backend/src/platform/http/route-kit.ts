import type { RequestHandler } from 'express';
import type { ProcedureExecutor } from '../db/executor.js';
import type { RateLimitPolicy } from '../rate-limit/rate-limit.js';
import type { RoleName } from '../security/tokens.js';
import type { Clock } from '../../shared-kernel/index.js';

/**
 * Lo que cada módulo necesita de la plataforma para montar sus rutas. La raíz de composición lo construye una vez y lo
 * entrega, de modo que ningún módulo conoce al otro ni crea sus propios middlewares.
 */
export interface RouteKit {
  execute: ProcedureExecutor;
  clock: Clock;
  authenticate: RequestHandler;
  /** Deja pasar al visitante, pero rechaza un token inválido (carrito de invitado) */
  optionalAuthenticate: RequestHandler;
  rateLimit: (policy: RateLimitPolicy) => RequestHandler;
  idempotent: (options: { required: boolean }) => RequestHandler;
  role: (...roles: RoleName[]) => RequestHandler;
  /** Tope de bytes de un comprobante */
  proofMaxBytes: number;
}
