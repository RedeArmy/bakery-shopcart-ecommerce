import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { storedKeyOf } from '../../checkout/index.js';
import { requireUser } from '../../../platform/http/authentication.js';
import type { RouteKit } from '../../../platform/http/route-kit.js';
import { pageQuery, positiveInt, money } from '../../../platform/http/serialise.js';
import type { Row } from '../../../platform/http/serialise.js';
import { createSingleFileUpload } from '../../../platform/http/upload.js';
import { unwrap } from '../../../platform/http/unwrap.js';
import { POLICIES } from '../../../platform/rate-limit/rate-limit.js';
import { AppError } from '../../../shared-kernel/index.js';
import type { PaymentsService, ProofDownload } from '../application/payments-service.js';
import type { PaymentsRepository } from '../application/payments-repository.js';

const idParam = z.object({ id: positiveInt });
const proofParams = z.object({ id: positiveInt, proofId: positiveInt });
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const proofFields = z.object({
  referenceNumber: z.string().trim().min(1).max(40),
  depositDate: z.iso.date(),
  depositedAmount: money,
});
const attemptBody = z.object({ idBankAccount: positiveInt.nullish() }).default({});
const rejectBody = z.object({ reason: z.string().trim().min(1).max(250) });

const DEPOSIT_STATUS = { Pending: 1, UnderReview: 2, Approved: 3, Rejected: 4 } as const;
const depositsQuery = pageQuery.extend({
  status: z.enum(['Pending', 'UnderReview', 'Approved', 'Rejected']).default('UnderReview'),
  from: instant.optional(),
  to: instant.optional(),
});

const bankAccountBody = z.object({
  bankName: z.string().trim().min(1).max(80),
  accountType: z.enum(['Checking', 'Savings']),
  accountNumber: z.string().trim().min(1).max(30),
  holderName: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(300).nullish(),
  isActive: z.boolean().default(true),
});

const refundsQuery = z.object({
  status: z.enum(['Pending', 'Processed', 'Failed']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const refundBody = z.object({
  status: z.enum(['Processed', 'Failed']),
  externalReference: z.string().trim().max(80).nullish(),
});

/** Cabeceras de una descarga privada: se muestra en el navegador, sin guardarse en cachés compartidas ni adivinar el tipo. */
function sendProof(res: Response, proof: ProofDownload): void {
  res.setHeader('Content-Type', proof.mimeType);
  res.setHeader('Content-Length', String(proof.sizeBytes));
  res.setHeader('Content-Disposition', `inline; filename="${proof.fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  proof.stream.on('error', () => {
    // El archivo desapareció del disco después de que la base de datos lo conocía: se corta la respuesta
    res.destroy();
  });
  proof.stream.pipe(res);
}

export function createPaymentsRouter(
  kit: RouteKit,
  repository: PaymentsRepository,
  service: PaymentsService,
): Router {
  const router = Router();
  const write = kit.rateLimit(POLICIES.authenticatedWrite);
  const customer = [kit.authenticate, kit.role('Customer')];
  const staff = [kit.authenticate, kit.role('Operator', 'Administrator')];
  const administrator = [kit.authenticate, kit.role('Administrator')];
  const required = kit.idempotent({ required: true });

  // --- Cliente ---------------------------------------------------------------------------

  router.get('/orders/:id/payment', ...customer, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await repository.paymentsOfOrder(requireUser(req).idUser, false, id));
  });

  // Después de un rechazo el depósito es terminal: el cliente abre otro intento para el mismo pedido
  router.post('/orders/:id/payment/attempts', ...customer, write, required, async (req, res) => {
    const user = requireUser(req);
    const { id } = idParam.parse(req.params);
    const body = attemptBody.parse(req.body);
    const attempt = await repository.createAttempt(
      user.idUser,
      id,
      storedKeyOf(user.idUser, req.header('Idempotency-Key') ?? ''),
      body.idBankAccount ?? null,
    );
    res.status(201).json(attempt);
  });

  router.post(
    '/orders/:id/payment/proofs',
    ...customer,
    kit.rateLimit(POLICIES.proofUpload),
    createSingleFileUpload('file', kit.proofMaxBytes),
    required,
    async (req, res) => {
      const user = requireUser(req);
      const { id } = idParam.parse(req.params);
      const fields = proofFields.parse(req.body);
      if (req.file === undefined) {
        throw new AppError(400, 'VALIDATION_ERROR', 'The file field is required');
      }
      const stored = unwrap(
        await service.uploadProof({
          userId: user.idUser,
          idOrder: id,
          file: { buffer: req.file.buffer, originalName: req.file.originalname },
          ...fields,
        }),
      );
      res.status(201).json(stored);
    },
  );

  router.get(
    '/orders/:id/payment/proofs/:proofId',
    ...customer,
    kit.rateLimit({ name: 'proof-download', limit: 30, windowMs: 60_000 }),
    async (req, res) => {
      const user = requireUser(req);
      const { id, proofId } = proofParams.parse(req.params);
      // El comprobante se busca entre los pagos del pedido: si el pedido no es suyo el procedimiento ya respondió 404
      const payments = await repository.paymentsOfOrder(user.idUser, false, id);
      const owner = payments.find((payment) =>
        ((payment['proofs'] as Row[] | undefined) ?? []).some(
          (proof) => proof['idPaymentProof'] === proofId,
        ),
      );
      if (owner === undefined) throw new AppError(404, 'NOT_FOUND', 'Proof not found');
      sendProof(
        res,
        await service.download(user.idUser, false, owner['idPayment'] as number, proofId),
      );
    },
  );

  // --- Personal --------------------------------------------------------------------------

  router.get('/admin/orders/:id/payment', ...staff, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await repository.paymentsOfOrder(requireUser(req).idUser, true, id));
  });

  router.get('/admin/payments/deposits', ...staff, async (req, res) => {
    const query = depositsQuery.parse(req.query);
    res.json(
      await repository.listDeposits({
        statusId: DEPOSIT_STATUS[query.status],
        from: query.from ?? null,
        to: query.to ?? null,
        page: query.page,
        size: query.size,
      }),
    );
  });

  router.get(
    '/admin/payments/:id/proofs/:proofId',
    ...staff,
    kit.rateLimit({ name: 'proof-download', limit: 30, windowMs: 60_000 }),
    async (req, res) => {
      const { id, proofId } = proofParams.parse(req.params);
      sendProof(res, await service.download(requireUser(req).idUser, true, id, proofId));
    },
  );

  router.post(
    '/admin/payments/:id/approve',
    ...staff,
    kit.rateLimit(POLICIES.review),
    required,
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      res.json({ outcome: await repository.approve(requireUser(req).idUser, id) });
    },
  );

  router.post(
    '/admin/payments/:id/reject',
    ...staff,
    kit.rateLimit(POLICIES.review),
    required,
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = rejectBody.parse(req.body);
      res.json({ outcome: await repository.reject(requireUser(req).idUser, id, body.reason) });
    },
  );

  // Cuentas bancarias: ver es del administrador porque aquí aparecen también las desactivadas
  router.get('/admin/bank-accounts', ...administrator, async (_req, res) => {
    res.json(await repository.listBankAccounts(true));
  });

  router.post('/admin/bank-accounts', ...administrator, write, required, async (req, res) => {
    const body = bankAccountBody.parse(req.body);
    const id = await repository.saveBankAccount(requireUser(req).idUser, null, {
      ...body,
      instructions: body.instructions ?? null,
    });
    res.status(201).json({ idBankAccount: id });
  });

  router.put(
    '/admin/bank-accounts/:id',
    ...administrator,
    write,
    kit.idempotent({ required: false }),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = bankAccountBody.parse(req.body);
      await repository.saveBankAccount(requireUser(req).idUser, id, {
        ...body,
        instructions: body.instructions ?? null,
      });
      res.json({ idBankAccount: id });
    },
  );

  // Reembolsos: los abre una cancelación, una devolución o un pago tardío; solo el administrador los cierra
  router.get('/admin/refunds', ...administrator, async (req, res) => {
    const query = refundsQuery.parse(req.query);
    res.json(await repository.listRefunds(query.status ?? null, query.limit));
  });

  router.patch('/admin/refunds/:id', ...administrator, write, required, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = refundBody.parse(req.body);
    await repository.markRefund(
      requireUser(req).idUser,
      id,
      body.status,
      body.externalReference ?? null,
    );
    res.json({ idRefund: id, status: body.status });
  });

  return router;
}
