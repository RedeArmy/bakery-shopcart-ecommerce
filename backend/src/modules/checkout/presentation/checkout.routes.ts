import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { positiveInt } from '../../../platform/http/serialise.js';
import { unwrap } from '../../../platform/http/unwrap.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { CheckoutService } from '../application/checkout-service.js';

const dateOnly = z.iso.date();
const methodsQuery = z.object({ deliveryDate: dateOnly });
const confirmBody = z.object({
  idReservation: positiveInt,
  idAddress: positiveInt,
  deliveryDate: dateOnly,
  method: z.enum(['CARD', 'BANK_DEPOSIT']),
  idBankAccount: positiveInt.nullish(),
});

export function createCheckoutRouter(kit: RouteKit, service: CheckoutService): Router {
  const router = Router();
  const customer = [kit.authenticate, kit.role('Customer')];

  router.get(
    '/checkout/payment-methods',
    ...customer,
    kit.rateLimit(POLICIES.publicCatalogue),
    async (req, res) => {
      const { deliveryDate } = methodsQuery.parse(req.query);
      res.json(await service.paymentMethods(requireUser(req).idUser, deliveryDate));
    },
  );

  router.post(
    '/checkout/start',
    ...customer,
    kit.rateLimit(POLICIES.authenticatedWrite),
    kit.idempotent({ required: true }),
    async (req, res) => {
      res.status(201).json(unwrap(await service.start(requireUser(req).idUser)));
    },
  );

  // Cinco confirmaciones por minuto: crear pedidos no es algo que se repita deprisa
  router.post(
    '/checkout/confirm',
    ...customer,
    kit.rateLimit(POLICIES.checkoutConfirm),
    kit.idempotent({ required: true }),
    async (req, res) => {
      const body = confirmBody.parse(req.body);
      const order = unwrap(
        await service.confirm({
          userId: requireUser(req).idUser,
          // El middleware ya comprobó que la cabecera existe y tiene la forma correcta
          idempotencyKey: req.header('Idempotency-Key') ?? '',
          idReservation: body.idReservation,
          idAddress: body.idAddress,
          deliveryDate: body.deliveryDate,
          method: body.method,
          idBankAccount: body.idBankAccount ?? null,
        }),
      );
      res.status(201).json(order);
    },
  );

  return router;
}
