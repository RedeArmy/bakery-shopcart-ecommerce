import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { pageQuery, positiveInt } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { InventoryRepository } from '../application/inventory-repository.js';

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const reason = z.string().trim().min(1).max(250);

const ledgerQuery = pageQuery.extend({
  variant: positiveInt,
  from: instant.optional(),
  to: instant.optional(),
});
const entryBody = z.object({
  idVariant: positiveInt,
  quantity: z.number().int().positive(),
  reason,
});
const adjustmentBody = z.object({
  idVariant: positiveInt,
  newOnHand: z.number().int().min(0),
  reason,
});

export function createInventoryRouter(kit: RouteKit, repository: InventoryRepository): Router {
  const router = Router();
  // El operador consulta el libro; solo el administrador mueve el stock (lo exigen los procedimientos, no solo la API)
  const reader = [kit.authenticate, kit.role('Operator', 'Administrator')];
  const writer = [
    kit.authenticate,
    kit.role('Administrator'),
    kit.rateLimit(POLICIES.authenticatedWrite),
  ];
  const required = kit.idempotent({ required: true });

  router.get('/admin/inventory/ledger', ...reader, async (req, res) => {
    const query = ledgerQuery.parse(req.query);
    res.json(
      await repository.ledger(
        query.variant,
        { from: query.from ?? null, to: query.to ?? null },
        query.page,
        query.size,
      ),
    );
  });

  router.post('/admin/inventory/entries', ...writer, required, async (req, res) => {
    const body = entryBody.parse(req.body);
    const movement = await repository.registerEntry(
      requireUser(req).idUser,
      body.idVariant,
      body.quantity,
      body.reason,
    );
    res.status(201).json({ idMovement: movement });
  });

  router.post('/admin/inventory/adjustments', ...writer, required, async (req, res) => {
    const body = adjustmentBody.parse(req.body);
    const movement = await repository.adjust(
      requireUser(req).idUser,
      body.idVariant,
      body.newOnHand,
      body.reason,
    );
    res.status(movement === null ? 200 : 201).json({ idMovement: movement });
  });

  return router;
}
