import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { pageQuery, positiveInt } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { OrdersRepository } from '../application/orders-repository.js';

const idParam = z.object({ id: positiveInt });
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const customerQuery = pageQuery.extend({
  status: z.coerce.number().int().min(1).max(8).optional(),
});
const staffQuery = customerQuery.extend({
  search: z.string().trim().max(100).optional(),
  from: instant.optional(),
  to: instant.optional(),
});

// El personal avanza el pedido por nombre; los números de estado son un detalle de la base de datos
const STATUS_IDS = { InPreparation: 3, Dispatched: 4, Delivered: 5 } as const;
const statusBody = z.object({
  status: z.enum(['InPreparation', 'Dispatched', 'Delivered']),
  comment: z.string().trim().max(250).nullish(),
});

const returnBody = z.object({
  reason: z.string().trim().min(1).max(250),
  lines: z
    .array(z.object({ idOrderLine: positiveInt, quantity: z.number().int().min(1).max(10_000) }))
    .min(1)
    .max(100),
});
const cancelBody = z.object({ reason: z.string().trim().min(1).max(250).nullish() }).default({});

export function createOrdersRouter(kit: RouteKit, repository: OrdersRepository): Router {
  const router = Router();
  const write = kit.rateLimit(POLICIES.authenticatedWrite);
  const customer = [kit.authenticate, kit.role('Customer')];
  const staff = [kit.authenticate, kit.role('Operator', 'Administrator')];
  const required = kit.idempotent({ required: true });

  // --- Cliente: solo sus pedidos, el IDUser sale del token ---------------------------------

  router.get('/orders', ...customer, async (req, res) => {
    const query = customerQuery.parse(req.query);
    res.json(
      await repository.list({
        actor: requireUser(req).idUser,
        asStaff: false,
        statusId: query.status ?? null,
        search: null,
        from: null,
        to: null,
        page: query.page,
        size: query.size,
      }),
    );
  });

  router.get('/orders/:id', ...customer, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await repository.detail(requireUser(req).idUser, false, id));
  });

  // Cancelan el cliente (su pedido) y el personal (cualquiera): el procedimiento distingue por el rol del actor
  router.post('/orders/:id/cancel', kit.authenticate, write, required, async (req, res) => {
    const user = requireUser(req);
    const { id } = idParam.parse(req.params);
    const body = cancelBody.parse(req.body);
    const reason =
      body.reason ??
      (user.role === 'Customer' ? 'Cancelled by the customer' : 'Cancelled by staff');
    await repository.cancel(user.idUser, id, reason);
    res.json(await repository.detail(user.idUser, user.role !== 'Customer', id));
  });

  // --- Personal --------------------------------------------------------------------------

  router.get('/admin/orders', ...staff, async (req, res) => {
    const query = staffQuery.parse(req.query);
    res.json(
      await repository.list({
        actor: requireUser(req).idUser,
        asStaff: true,
        statusId: query.status ?? null,
        search: query.search ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        page: query.page,
        size: query.size,
      }),
    );
  });

  router.get('/admin/orders/:id', ...staff, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await repository.detail(requireUser(req).idUser, true, id));
  });

  router.patch('/admin/orders/:id/status', ...staff, write, required, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = statusBody.parse(req.body);
    await repository.changeStatus(
      requireUser(req).idUser,
      id,
      STATUS_IDS[body.status],
      body.comment ?? null,
    );
    res.json(await repository.detail(requireUser(req).idUser, true, id));
  });

  router.post('/admin/orders/:id/returns', ...staff, write, required, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = returnBody.parse(req.body);
    const registered = await repository.registerReturn(
      requireUser(req).idUser,
      id,
      body.reason,
      body.lines,
    );
    res.status(201).json(registered);
  });

  return router;
}
