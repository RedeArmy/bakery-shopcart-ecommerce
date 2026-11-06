import { Router } from 'express';
import type { CookieOptions, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import { readCookie } from '../../../platform/http/cookies.js';
import { unwrap } from '../../../platform/http/unwrap.js';
import type { AuthService } from '../application/auth-service.js';

const email = z.string().trim().toLowerCase().pipe(z.email().max(256));

const registerBody = z.object({
  email,
  // Largo mínimo de NIST; el máximo evita que una contraseña enorme se use para agotar el servidor con argon2
  password: z.string().min(10).max(128),
  fullName: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+() -]{6,20}$/)
    .nullish()
    .transform((value) => value ?? null),
});
const loginBody = z.object({ email, password: z.string().min(1).max(128) });
const refreshToken = z.string().min(20).max(200);

/** La cookie solo viaja a las rutas de autenticación: el resto de la API nunca la recibe (ADR-0026) */
export const REFRESH_COOKIE_NAME = 'refreshToken';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface RefreshCookieSettings {
  /** Vida de la cookie en milisegundos: la misma que la del token de refresco */
  maxAgeMs: number;
  /** Solo con HTTPS; en desarrollo local por http el navegador la descartaría */
  secure: boolean;
}

export interface AuthRouteDependencies {
  service: AuthService;
  authenticate: RequestHandler;
  /** Límites de docs/api/conventions.md: 5 por minuto para el alta y el inicio de sesión, 20 para renovar */
  limitAuthentication: RequestHandler;
  limitRefresh: RequestHandler;
  refreshCookie: RefreshCookieSettings;
}

export function createAuthRouter({
  service,
  authenticate,
  limitAuthentication,
  limitRefresh,
  refreshCookie,
}: AuthRouteDependencies): Router {
  const router = Router();
  const cookieBase: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: refreshCookie.secure,
    path: REFRESH_COOKIE_PATH,
  };

  /**
   * Un token explícito en el cuerpo gana a la cookie: la cookie viaja sola (un cliente con jar de cookies, como Postman,
   * reenvía la última) y quien manda un token en el cuerpo lo hace a propósito, por ejemplo para probar la reutilización.
   * El navegador nunca manda cuerpo, así que él siempre usa la cookie.
   */
  const presentedToken = (req: Request): unknown =>
    (typeof req.body === 'object' && req.body !== null
      ? (req.body as { refreshToken?: unknown }).refreshToken
      : undefined) ?? readCookie(req, REFRESH_COOKIE_NAME);

  router.post('/auth/register', limitAuthentication, async (req, res) => {
    const body = registerBody.parse(req.body);
    res.status(201).json(unwrap(await service.register(body)));
  });

  router.post('/auth/login', limitAuthentication, async (req, res) => {
    const { email: address, password } = loginBody.parse(req.body);
    const session = unwrap(await service.login(address, password));
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      ...cookieBase,
      maxAge: refreshCookie.maxAgeMs,
    });
    res.json(session);
  });

  router.post('/auth/refresh', limitRefresh, async (req, res) => {
    const result = await service.refresh(refreshToken.parse(presentedToken(req)));
    // Un token inválido o reutilizado no debe seguir viajando: se borra la cookie junto con la respuesta 401
    if (!result.ok) res.clearCookie(REFRESH_COOKIE_NAME, cookieBase);
    const session = unwrap(result);
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      ...cookieBase,
      maxAge: refreshCookie.maxAgeMs,
    });
    res.json(session);
  });

  router.post('/auth/logout', limitRefresh, async (req, res) => {
    const presented = presentedToken(req);
    // Cerrar sesión sin token no tiene nada que revocar: es idempotente y solo limpia la cookie
    if (presented !== undefined) await service.logout(refreshToken.parse(presented));
    res.clearCookie(REFRESH_COOKIE_NAME, cookieBase);
    res.status(204).end();
  });

  router.get('/auth/me', authenticate, async (req, res) => {
    res.json(unwrap(await service.profile(requireUser(req).idUser)));
  });

  return router;
}
