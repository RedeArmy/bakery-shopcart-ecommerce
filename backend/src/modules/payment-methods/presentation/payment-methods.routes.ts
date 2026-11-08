import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { positiveInt } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { PaymentMethodsRepository } from '../application/payment-methods-repository.js';

const idParam = z.object({ id: positiveInt });

const methodBody = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  appliesToDelivery: z.boolean(),
  appliesToPickup: z.boolean(),
});

const createBody = methodBody.extend({ kind: z.enum(['Deposit', 'Cash']) });
const updateBody = methodBody.extend({ isActive: z.boolean().optional() });

const toInput = (body: z.infer<typeof methodBody>) => ({
  title: body.title,
  description: body.description ?? null,
  appliesToDelivery: body.appliesToDelivery,
  appliesToPickup: body.appliesToPickup,
});

export function createPaymentMethodsRouter(
  kit: RouteKit,
  repository: PaymentMethodsRepository,
): Router {
  const router = Router();
  const write = kit.rateLimit(POLICIES.authenticatedWrite);
  const administrator = [kit.authenticate, kit.role('Administrator')];
  const required = kit.idempotent({ required: true });
  const optional = kit.idempotent({ required: false });

  // Aquí aparecen también los desactivados; lo que ve el cliente lo decide el checkout según cómo recibe el pedido
  router.get('/admin/payment-methods', ...administrator, async (_req, res) => {
    res.json(await repository.list());
  });

  router.post('/admin/payment-methods', ...administrator, write, required, async (req, res) => {
    const body = createBody.parse(req.body);
    const id = await repository.create(requireUser(req).idUser, body.kind, toInput(body));
    res.status(201).json({ idPaymentMethod: id });
  });

  router.put('/admin/payment-methods/:id', ...administrator, write, optional, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = updateBody.parse(req.body);
    await repository.update(requireUser(req).idUser, id, toInput(body), body.isActive ?? null);
    res.json({ idPaymentMethod: id });
  });

  // "Eliminar" es desactivar: los pagos ya hechos citan el método y lo conservan
  router.delete(
    '/admin/payment-methods/:id',
    ...administrator,
    write,
    optional,
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      await repository.deactivate(requireUser(req).idUser, id);
      res.status(200).json({ idPaymentMethod: id, isActive: false });
    },
  );

  return router;
}
