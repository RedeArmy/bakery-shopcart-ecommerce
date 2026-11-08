import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { positiveInt } from '../../../platform/http/serialise.js';
import { unwrap } from '../../../platform/http/unwrap.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import { AppError } from '../../../shared-kernel/index.js';
import type { CheckoutService } from '../application/checkout-service.js';

const dateOnly = z.iso.date();
// La fecha ya no la elige el cliente: sin ella el sistema evalúa la que él define. Se acepta por compatibilidad.
const methodsQuery = z.object({
  deliveryDate: dateOnly.optional(),
  // Lo que se ofrece depende de cómo se recibe el pedido: el efectivo solo existe para recogidas
  fulfilment: z.enum(['Delivery', 'Pickup']).default('Delivery'),
});
const confirmBody = z.object({
  idReservation: positiveInt,
  fulfilmentType: z.enum(['Delivery', 'Pickup']).default('Delivery'),
  idAddress: positiveInt.nullish(),
  idBranch: positiveInt.nullish(),
  deliveryDate: dateOnly.nullish(),
  // Instrucciones opcionales para quien entrega; un texto vacío se trata como ninguna
  deliveryNotes: z.string().trim().max(300).nullish(),
  idPaymentMethod: positiveInt.optional(),
  // Llamadas anteriores enviaban el código; se sigue aceptando
  method: z.enum(['CARD', 'BANK_DEPOSIT']).optional(),
  // Las cuentas ya no se eligen; se acepta por compatibilidad y se ignora si el método no es un depósito
  idBankAccount: positiveInt.nullish(),
});

const LEGACY_METHOD_ID = { CARD: 1, BANK_DEPOSIT: 2 } as const;

export function createCheckoutRouter(kit: RouteKit, service: CheckoutService): Router {
  const router = Router();
  const customer = [kit.authenticate, kit.role('Customer')];

  router.get(
    '/checkout/payment-methods',
    ...customer,
    kit.rateLimit(POLICIES.publicCatalogue),
    async (req, res) => {
      const { deliveryDate, fulfilment } = methodsQuery.parse(req.query);
      res.json(
        await service.paymentMethods(requireUser(req).idUser, fulfilment, deliveryDate ?? null),
      );
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
      const idPaymentMethod =
        body.idPaymentMethod ??
        (body.method === undefined ? undefined : LEGACY_METHOD_ID[body.method]);
      if (idPaymentMethod === undefined) {
        throw new AppError(400, 'VALIDATION_ERROR', 'idPaymentMethod is required');
      }
      const order = unwrap(
        await service.confirm({
          userId: requireUser(req).idUser,
          // El middleware ya comprobó que la cabecera existe y tiene la forma correcta
          idempotencyKey: req.header('Idempotency-Key') ?? '',
          idReservation: body.idReservation,
          fulfilmentType: body.fulfilmentType,
          idAddress: body.idAddress ?? null,
          idBranch: body.idBranch ?? null,
          deliveryDate: body.deliveryDate ?? null,
          deliveryNotes:
            body.deliveryNotes === undefined || body.deliveryNotes === ''
              ? null
              : body.deliveryNotes,
          idPaymentMethod,
          idBankAccount: body.idBankAccount ?? null,
        }),
      );
      res.status(201).json(order);
    },
  );

  return router;
}
