import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { positiveInt } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import { AppError } from '../../../shared-kernel/index.js';
import type { CartIdentity, CartRepository } from '../application/cart-repository.js';

const variantParam = z.object({ variantId: positiveInt });
const itemBody = z.object({
  quantity: z.number().int().min(1).max(99),
  inscription: z.string().trim().max(60).nullish(),
});
const couponBody = z.object({ code: z.string().trim().min(1).max(30) });
const mergeBody = z.object({ guestToken: z.uuid() });

const CART_TOKEN_HEADER = 'X-Cart-Token';

/** El carrito de una cuenta gana al del visitante; sin ninguno de los dos no hay carrito. */
function identityOf(req: Request): CartIdentity | undefined {
  const user = currentUser(req);
  if (user !== undefined) return { userId: user.idUser };
  const token = req.header(CART_TOKEN_HEADER);
  if (token === undefined) return undefined;
  const parsed = z.uuid().safeParse(token);
  if (!parsed.success) {
    throw new AppError(400, 'CART_TOKEN_INVALID', 'The X-Cart-Token header must be a UUID');
  }
  return { guestToken: parsed.data };
}

function requireIdentity(req: Request): CartIdentity {
  const identity = identityOf(req);
  if (identity === undefined) {
    throw new AppError(400, 'CART_TOKEN_REQUIRED', 'Send a bearer token or an X-Cart-Token header');
  }
  return identity;
}

/** Carrito vacío de quien todavía no tiene token ni cuenta: no se toca la base de datos. */
const EMPTY_CART = {
  idCart: null,
  couponCode: null,
  couponReason: null,
  subtotal: '0.00',
  discount: '0.00',
  total: '0.00',
  vat: '0.00',
  taxableBase: '0.00',
  itemCount: 0,
  hasUnavailableLines: false,
  lines: [],
};

export function createCartRouter(kit: RouteKit, repository: CartRepository): Router {
  const router = Router();
  // Visitante o cuenta: ambos pasan, un token inválido no
  const identify = kit.optionalAuthenticate;
  const guestOrUser = kit.rateLimit({
    ...POLICIES.authenticatedWrite,
    name: 'cart',
    limit: 60,
    // Un visitante cuenta por su token (30 por minuto en la tabla de la documentación para visitantes)
    key: (req) => {
      const user = currentUser(req);
      return user === undefined
        ? `guest:${req.header(CART_TOKEN_HEADER) ?? req.ip ?? 'unknown'}`
        : `user:${user.idUser}`;
    },
  });
  const optional = kit.idempotent({ required: false });

  router.get('/cart', identify, guestOrUser, async (req, res) => {
    const identity = identityOf(req);
    res.json(identity === undefined ? EMPTY_CART : await repository.get(identity));
  });

  router.put('/cart/items/:variantId', identify, guestOrUser, optional, async (req, res) => {
    const identity = requireIdentity(req);
    const { variantId } = variantParam.parse(req.params);
    const body = itemBody.parse(req.body);
    await repository.setItem(identity, variantId, body.quantity, body.inscription ?? null);
    res.json(await repository.get(identity));
  });

  router.delete('/cart/items/:variantId', identify, guestOrUser, optional, async (req, res) => {
    const identity = requireIdentity(req);
    const { variantId } = variantParam.parse(req.params);
    await repository.removeItem(identity, variantId);
    res.json(await repository.get(identity));
  });

  // Los cupones son de la cuenta: un visitante no tiene a quién cobrarle el uso
  router.post(
    '/cart/coupon',
    kit.authenticate,
    guestOrUser,
    kit.idempotent({ required: true }),
    async (req, res) => {
      const user = requireUser(req);
      const body = couponBody.parse(req.body);
      await repository.applyCoupon(user.idUser, body.code);
      res.json(await repository.get({ userId: user.idUser }));
    },
  );

  router.delete('/cart/coupon', kit.authenticate, guestOrUser, optional, async (req, res) => {
    const user = requireUser(req);
    await repository.removeCoupon(user.idUser);
    res.json(await repository.get({ userId: user.idUser }));
  });

  // Al iniciar sesión el panel entrega el carrito del visitante a la cuenta; repetirlo no cambia nada
  router.post('/cart/merge', kit.authenticate, guestOrUser, async (req, res) => {
    const user = requireUser(req);
    const body = mergeBody.parse(req.body);
    await repository.mergeGuest(user.idUser, body.guestToken);
    res.json(await repository.get({ userId: user.idUser }));
  });

  return router;
}
