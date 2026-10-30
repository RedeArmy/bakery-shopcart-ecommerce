import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared-kernel/index.js';
import type { Clock } from '../../shared-kernel/index.js';
import { currentUser } from '../http/authentication.js';

export interface HitResult {
  count: number;
  /** Instante en que se reinicia la ventana, en milisegundos desde la época */
  resetAt: number;
}

/** Puerto del almacén de contadores: hoy en memoria; con varias réplicas bastaría otro adaptador (ADR-0010). */
export interface RateLimitStorePort {
  hit(key: string, windowMs: number, nowMs: number): HitResult;
}

/** Ventana fija en memoria. Las ventanas vencidas se barren al pasar el tiempo para que el mapa no crezca sin límite. */
export function createMemoryRateLimitStore(): RateLimitStorePort {
  const windows = new Map<string, HitResult>();
  let lastSweep = 0;
  return {
    hit(key, windowMs, nowMs) {
      if (nowMs - lastSweep > windowMs) {
        for (const [stored, window] of windows) if (window.resetAt <= nowMs) windows.delete(stored);
        lastSweep = nowMs;
      }
      const current = windows.get(key);
      if (current === undefined || current.resetAt <= nowMs) {
        const fresh = { count: 1, resetAt: nowMs + windowMs };
        windows.set(key, fresh);
        return fresh;
      }
      current.count += 1;
      return current;
    },
  };
}

export interface RateLimitPolicy {
  /** Nombre del grupo: separa los contadores de políticas distintas que comparten clave */
  name: string;
  limit: number;
  windowMs: number;
  /** Quién cuenta: la cuenta si hay sesión y la IP si no, salvo que la política diga otra cosa */
  key?: (req: Request) => string;
}

/** Clave por defecto: el IDUser autenticado y, en su defecto, la IP (nginx es el único proxy de confianza). */
export const userOrIp = (req: Request): string => {
  const user = currentUser(req);
  return user === undefined ? `ip:${req.ip ?? 'unknown'}` : `user:${user.idUser}`;
};

export const byIp = (req: Request): string => `ip:${req.ip ?? 'unknown'}`;

/** Políticas de docs/api/conventions.md; cada ruta usa la suya. */
export const POLICIES = {
  global: { name: 'global', limit: 300, windowMs: 60_000, key: byIp },
  authentication: { name: 'authentication', limit: 5, windowMs: 60_000, key: byIp },
  refresh: { name: 'refresh', limit: 20, windowMs: 60_000, key: byIp },
  publicCatalogue: { name: 'catalogue', limit: 120, windowMs: 60_000, key: byIp },
  authenticatedWrite: { name: 'write', limit: 60, windowMs: 60_000 },
  checkoutConfirm: { name: 'checkout-confirm', limit: 5, windowMs: 60_000 },
  proofUpload: { name: 'proof-upload', limit: 5, windowMs: 60_000 },
  review: { name: 'review', limit: 60, windowMs: 60_000 },
  dashboard: { name: 'dashboard', limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

/** Responde 429 con Retry-After y las cabeceras RateLimit-* cuando se supera el límite del grupo. */
export function createRateLimiter(store: RateLimitStorePort, clock: Clock) {
  return function rateLimit(policy: RateLimitPolicy): RequestHandler {
    const keyOf = policy.key ?? userOrIp;
    return (req, res, next) => {
      const nowMs = clock.now().getTime();
      const hit = store.hit(`${policy.name}:${keyOf(req)}`, policy.windowMs, nowMs);
      const remaining = Math.max(0, policy.limit - hit.count);
      const resetSeconds = Math.max(1, Math.ceil((hit.resetAt - nowMs) / 1000));
      res.setHeader('RateLimit-Limit', String(policy.limit));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(resetSeconds));
      if (hit.count > policy.limit) {
        res.setHeader('Retry-After', String(resetSeconds));
        throw new AppError(429, 'RATE_LIMITED', 'Too many requests, try again later');
      }
      next();
    };
  };
}
