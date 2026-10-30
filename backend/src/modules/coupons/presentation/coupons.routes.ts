import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { money, pageQuery, positiveInt } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { CouponsRepository } from '../application/coupons-repository.js';

const idParam = z.object({ id: positiveInt });
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const couponFields = z.object({
  type: z.enum(['Percentage', 'FixedAmount']),
  value: money,
  minimumAmount: money.default('0.00'),
  startsAt: instant,
  endsAt: instant,
  totalUsageLimit: z.number().int().positive().nullish(),
  perCustomerUsageLimit: z.number().int().positive().nullish(),
  categoryId: positiveInt.nullish(),
});
const createBody = couponFields.extend({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,30}$/),
});

const listQuery = pageQuery.extend({
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
});

const toInput = (body: z.infer<typeof couponFields>) => ({
  type: body.type,
  value: body.value,
  minimumAmount: body.minimumAmount,
  startsAt: body.startsAt,
  endsAt: body.endsAt,
  totalUsageLimit: body.totalUsageLimit ?? null,
  perCustomerUsageLimit: body.perCustomerUsageLimit ?? null,
  categoryId: body.categoryId ?? null,
});

export function createCouponsRouter(kit: RouteKit, repository: CouponsRepository): Router {
  const router = Router();
  const administrator = [
    kit.authenticate,
    kit.role('Administrator'),
    kit.rateLimit(POLICIES.authenticatedWrite),
  ];

  router.get('/admin/coupons', ...administrator, async (req, res) => {
    const query = listQuery.parse(req.query);
    res.json(await repository.list(query.includeInactive, query.page, query.size));
  });

  router.post(
    '/admin/coupons',
    ...administrator,
    kit.idempotent({ required: true }),
    async (req, res) => {
      const body = createBody.parse(req.body);
      const id = await repository.create(requireUser(req).idUser, body.code, toInput(body));
      res.status(201).json({ idCoupon: id });
    },
  );

  router.put(
    '/admin/coupons/:id',
    ...administrator,
    kit.idempotent({ required: false }),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      await repository.update(requireUser(req).idUser, id, toInput(couponFields.parse(req.body)));
      res.json({ idCoupon: id });
    },
  );

  router.delete(
    '/admin/coupons/:id',
    ...administrator,
    kit.idempotent({ required: false }),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      await repository.deactivate(requireUser(req).idUser, id);
      res.json({ idCoupon: id, isActive: false });
    },
  );

  return router;
}
