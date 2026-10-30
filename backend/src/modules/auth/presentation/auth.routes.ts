import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
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
const tokenBody = z.object({ refreshToken: z.string().min(20).max(200) });

export interface AuthRouteDependencies {
  service: AuthService;
  authenticate: RequestHandler;
  /** Límites de docs/api/conventions.md: 5 por minuto para el alta y el inicio de sesión, 20 para renovar */
  limitAuthentication: RequestHandler;
  limitRefresh: RequestHandler;
}

export function createAuthRouter({
  service,
  authenticate,
  limitAuthentication,
  limitRefresh,
}: AuthRouteDependencies): Router {
  const router = Router();

  router.post('/auth/register', limitAuthentication, async (req, res) => {
    const body = registerBody.parse(req.body);
    res.status(201).json(unwrap(await service.register(body)));
  });

  router.post('/auth/login', limitAuthentication, async (req, res) => {
    const { email: address, password } = loginBody.parse(req.body);
    res.json(unwrap(await service.login(address, password)));
  });

  router.post('/auth/refresh', limitRefresh, async (req, res) => {
    const { refreshToken } = tokenBody.parse(req.body);
    res.json(unwrap(await service.refresh(refreshToken)));
  });

  router.post('/auth/logout', limitRefresh, async (req, res) => {
    const { refreshToken } = tokenBody.parse(req.body);
    await service.logout(refreshToken);
    res.status(204).end();
  });

  router.get('/auth/me', authenticate, async (req, res) => {
    res.json(unwrap(await service.profile(requireUser(req).idUser)));
  });

  return router;
}
