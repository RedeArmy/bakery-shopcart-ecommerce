import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { positiveInt } from '../../../platform/http/serialise.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import type { BranchesRepository } from '../application/branches-repository.js';

const idParam = z.object({ id: positiveInt });

const branchBody = z.object({
  name: z.string().trim().min(1).max(80),
  line1: z.string().trim().min(1).max(200),
  municipality: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).nullish(),
  openingHours: z.string().trim().max(200).nullish(),
});

const toInput = (body: z.infer<typeof branchBody>) => ({
  name: body.name,
  line1: body.line1,
  municipality: body.municipality,
  department: body.department,
  phone: body.phone ?? null,
  openingHours: body.openingHours ?? null,
});

export function createBranchesRouter(kit: RouteKit, repository: BranchesRepository): Router {
  const router = Router();
  const write = kit.rateLimit(POLICIES.authenticatedWrite);
  const administrator = [kit.authenticate, kit.role('Administrator')];
  const required = kit.idempotent({ required: true });
  const optional = kit.idempotent({ required: false });

  // Las sucursales activas se ven sin cuenta: el cliente las elige al comprar y el visitante las puede consultar
  router.get('/branches', kit.rateLimit(POLICIES.publicCatalogue), async (_req, res) => {
    res.json(await repository.list(false));
  });

  router.get('/admin/branches', ...administrator, async (_req, res) => {
    res.json(await repository.list(true));
  });

  router.post('/admin/branches', ...administrator, write, required, async (req, res) => {
    const id = await repository.create(
      requireUser(req).idUser,
      toInput(branchBody.parse(req.body)),
    );
    res.status(201).json({ idBranch: id });
  });

  router.put('/admin/branches/:id', ...administrator, write, optional, async (req, res) => {
    const { id } = idParam.parse(req.params);
    await repository.update(requireUser(req).idUser, id, toInput(branchBody.parse(req.body)));
    res.json({ idBranch: id });
  });

  // "Eliminar" es desactivar: los pedidos ya hechos citan la sucursal y la conservan
  router.delete('/admin/branches/:id', ...administrator, write, optional, async (req, res) => {
    const { id } = idParam.parse(req.params);
    await repository.deactivate(requireUser(req).idUser, id);
    res.status(200).json({ idBranch: id, isActive: false });
  });

  return router;
}
