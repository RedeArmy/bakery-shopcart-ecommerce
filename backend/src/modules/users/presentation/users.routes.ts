import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { pageQuery, positiveInt } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { UsersRepository } from '../application/users-repository.js';

const idParam = z.object({ id: positiveInt });

const addressBody = z.object({
  label: z.string().trim().min(1).max(40),
  recipient: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+() -]{6,20}$/),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullish(),
  municipality: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(80),
  reference: z.string().trim().max(200).nullish(),
  isActive: z.boolean().default(true),
});

const usersQuery = pageQuery.extend({
  search: z.string().trim().max(100).optional(),
  role: z.coerce.number().int().min(1).max(3).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export function createUsersRouter(kit: RouteKit, repository: UsersRepository): Router {
  const router = Router();
  const write = kit.rateLimit(POLICIES.authenticatedWrite);
  const customer = [kit.authenticate, kit.role('Customer')];
  const administrator = [kit.authenticate, kit.role('Administrator')];

  const toInput = (body: z.infer<typeof addressBody>) => ({
    ...body,
    line2: body.line2 ?? null,
    reference: body.reference ?? null,
  });

  // --- Direcciones: siempre las de quien lleva el token ---------------------------------------

  router.get('/addresses', ...customer, async (req, res) => {
    res.json(await repository.listAddresses(requireUser(req).idUser, false));
  });

  router.post(
    '/addresses',
    ...customer,
    write,
    kit.idempotent({ required: true }),
    async (req, res) => {
      const body = addressBody.parse(req.body);
      const id = await repository.saveAddress(requireUser(req).idUser, null, toInput(body));
      res.status(201).json({ idAddress: id });
    },
  );

  router.put(
    '/addresses/:id',
    ...customer,
    write,
    kit.idempotent({ required: false }),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = addressBody.parse(req.body);
      // Una dirección ajena responde 404: lo decide el procedimiento con el IDUser del token
      await repository.saveAddress(requireUser(req).idUser, id, toInput(body));
      res.json({ idAddress: id });
    },
  );

  // --- Administración de cuentas -----------------------------------------------------------

  router.get('/admin/users', ...administrator, async (req, res) => {
    const query = usersQuery.parse(req.query);
    res.json(
      await repository.listUsers({
        search: query.search ?? null,
        roleId: query.role ?? null,
        isActive: query.active ?? null,
        page: query.page,
        size: query.size,
      }),
    );
  });

  router.patch(
    '/admin/users/:id',
    ...administrator,
    write,
    kit.idempotent({ required: true }),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z.object({ isActive: z.boolean() }).parse(req.body);
      await repository.setUserStatus(requireUser(req).idUser, id, body.isActive);
      res.json({ idUser: id, isActive: body.isActive });
    },
  );

  return router;
}
