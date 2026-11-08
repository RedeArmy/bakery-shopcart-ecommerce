// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import { renderApp, resetSession, signInAs } from './support/render';

beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const queue = (items: unknown[], extra = {}) => ({
  items,
  page: 1,
  size: 10,
  total: items.length,
  ...extra,
});

const deposit = (extra = {}) => ({
  idPayment: 11,
  idOrder: 4,
  orderNumber: 'PED-2030-000004',
  customerName: 'Ana Pérez',
  customerEmail: 'ana@example.test',
  amount: '145.00',
  idPaymentStatus: 2,
  statusName: 'UnderReview',
  bankName: 'Banco Industrial',
  referenceNumber: 'REF-9981',
  depositDate: '2030-06-01',
  depositedAmount: '145.00',
  rejectionReason: null,
  idPaymentProof: 9,
  submittedAt: '2030-06-01T12:10:00Z',
  ageHours: 3,
  ...extra,
});

const cash = (extra = {}) => ({
  idPayment: 21,
  idOrder: 8,
  orderNumber: 'PED-2030-000008',
  customerName: 'Luis Gómez',
  customerEmail: 'luis@example.test',
  amount: '90.00',
  idPaymentStatus: 1,
  statusName: 'Pending',
  pickupBranchName: 'Centro',
  requestedDeliveryDate: '2030-06-10',
  expiresAt: '2030-06-10T23:59:00Z',
  createdAt: '2030-06-01T12:00:00Z',
  ...extra,
});

describe('the deposit review queue', () => {
  it('asks for the deposits under review and shows what the customer said, to compare with the bank', async () => {
    await signInAs('Operator');
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/deposits': json(queue([deposit()])),
    });
    renderApp('/admin/payments/deposits');

    expect(await screen.findByRole('heading', { name: 'Revisión de depósitos' })).toBeDefined();
    expect(await screen.findByText('PED-2030-000004')).toBeDefined();
    expect(screen.getByText(/Ana Pérez/)).toBeDefined();
    expect(screen.getByText('Banco Industrial')).toBeDefined();
    expect(screen.getByText('REF-9981')).toBeDefined();
    expect(screen.getByText('Enviado hace 3 horas')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDefined();
    expect(screen.queryByRole('note')).toBeNull();

    const asked = calls.find((call) => call.path === '/api/v1/admin/payments/deposits');
    expect(new URLSearchParams(asked?.search).get('status')).toBe('UnderReview');
    expect(new URLSearchParams(asked?.search).get('size')).toBe('10');
    expect(new URLSearchParams(asked?.search).has('search')).toBe(false);
  });

  it('warns when the deposited amount is not the amount of the order', async () => {
    await signInAs('Operator');
    installFakeApi({
      'GET /api/v1/admin/payments/deposits': json(queue([deposit({ depositedAmount: '140.00' })])),
    });
    renderApp('/admin/payments/deposits');

    expect(await screen.findByRole('note')).toBeDefined();
    expect(screen.getByText(/no coincide con el del pedido/)).toBeDefined();
  });

  it('approves with an idempotency key and tells what happened', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    let approved = false;
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/deposits': () => json(queue(approved ? [] : [deposit()])),
      'POST /api/v1/admin/payments/11/approve': () => {
        approved = true;
        return json({ outcome: 'Approved' });
      },
    });
    renderApp('/admin/payments/deposits');

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText('Depósito aprobado: el pedido quedó pagado.')).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText('PED-2030-000004')).toBeNull();
    });
    const sent = calls.find((call) => call.method === 'POST');
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('says so when the server rejects the deposit because the amount does not match', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/payments/deposits': json(queue([deposit({ depositedAmount: '140.00' })])),
      'POST /api/v1/admin/payments/11/approve': json({ outcome: 'RejectedAmountMismatch' }),
    });
    renderApp('/admin/payments/deposits');

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText(/el depósito se rechazó/)).toBeDefined();
  });

  it('asks for the reason before rejecting and sends it', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/deposits': json(queue([deposit()])),
      'POST /api/v1/admin/payments/11/reject': json({ outcome: 'Rejected' }),
    });
    renderApp('/admin/payments/deposits');

    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    await user.click(await screen.findByRole('button', { name: 'Rechazar depósito' }));
    expect(await screen.findByText('Escriba el motivo del rechazo.')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText('Motivo del rechazo'), 'La referencia no existe');
    await user.click(screen.getByRole('button', { name: 'Rechazar depósito' }));

    expect(
      await screen.findByText('Depósito rechazado: el cliente puede enviar otro comprobante.'),
    ).toBeDefined();
    const sent = calls.find((call) => call.method === 'POST');
    expect(sent?.body).toEqual({ reason: 'La referencia no existe' });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('closes the rejection form without calling the server when the reviewer changes their mind', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/deposits': json(queue([deposit()])),
    });
    renderApp('/admin/payments/deposits');

    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Motivo del rechazo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('shows the answer of the server when the payment can no longer be approved', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/payments/deposits': json(queue([deposit()])),
      'POST /api/v1/admin/payments/11/approve': apiError(422, 'PAYMENT_NOT_UNDER_REVIEW'),
    });
    renderApp('/admin/payments/deposits');

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('opens the proof from a local address, because the download needs the token of the session', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const open = vi.fn();
    const create = vi.fn(() => 'blob:proof-9');
    vi.stubGlobal('open', open);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/deposits': json(queue([deposit()])),
      'GET /api/v1/admin/payments/11/proofs/9': () =>
        new Response('file', { status: 200, headers: { 'content-type': 'image/png' } }),
    });
    renderApp('/admin/payments/deposits');

    await user.click(await screen.findByRole('button', { name: 'Ver comprobante' }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith('blob:proof-9', '_blank', 'noopener');
    });
    const download = calls.find((call) => call.path === '/api/v1/admin/payments/11/proofs/9');
    expect(download?.headers.get('Authorization')).toMatch(/^Bearer /);
  });

  it('shows the history with the reason of the rejection and no actions', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/deposits': (call) =>
        new URLSearchParams(call.search).get('status') === 'Rejected'
          ? json(
              queue([
                deposit({
                  statusName: 'Rejected',
                  rejectionReason: 'La referencia no existe',
                  ageHours: 30,
                }),
              ]),
            )
          : json(queue([deposit()])),
    });
    renderApp('/admin/payments/deposits');

    await user.click(await screen.findByRole('button', { name: 'Rechazados' }));

    expect(await screen.findByText('Motivo del rechazo: La referencia no existe')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rechazados' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      calls.some(
        (call) =>
          new URLSearchParams(call.search).get('status') === 'Rejected' && call.method === 'GET',
      ),
    ).toBe(true);
  });

  it('explains that there is nothing to review and lets the reviewer try again after an error', async () => {
    await signInAs('Operator');
    installFakeApi({ 'GET /api/v1/admin/payments/deposits': json(queue([])) });
    renderApp('/admin/payments/deposits');
    expect(await screen.findByText('No hay depósitos aquí')).toBeDefined();
    cleanup();

    installFakeApi({ 'GET /api/v1/admin/payments/deposits': apiError(500, 'INTERNAL_ERROR') });
    renderApp('/admin/payments/deposits');
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeDefined();
  });

  it('pages through the queue and keeps the page in the address', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/deposits': json(queue([deposit()], { total: 25 })),
    });
    renderApp('/admin/payments/deposits');

    await user.click(await screen.findByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(calls.some((call) => new URLSearchParams(call.search).get('page') === '2')).toBe(true);
    });
  });

  it('searches the queue by the order number the customer gives', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/deposits': (call) =>
        new URLSearchParams(call.search).get('search') === 'PED-2030-000004'
          ? json(queue([deposit()]))
          : json(queue([deposit(), deposit({ idPayment: 12, orderNumber: 'PED-2030-000005' })])),
    });
    renderApp('/admin/payments/deposits');

    await screen.findByText('PED-2030-000005');
    await user.type(screen.getByLabelText('Buscar un pedido'), ' PED-2030-000004 ');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(screen.queryByText('PED-2030-000005')).toBeNull();
    });
    expect(screen.getByText('PED-2030-000004')).toBeDefined();
    expect(
      calls.some((call) => new URLSearchParams(call.search).get('search') === 'PED-2030-000004'),
    ).toBe(true);
  });

  it('tells apart an empty queue from a search without results', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({ 'GET /api/v1/admin/payments/deposits': json(queue([])) });
    renderApp('/admin/payments/deposits');

    expect(await screen.findByText('No hay depósitos aquí')).toBeDefined();
    await user.type(screen.getByLabelText('Buscar un pedido'), 'nadie');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Ningún depósito coincide con la búsqueda.')).toBeDefined();
  });

  it('keeps the queue and the cash payments away from a customer', async () => {
    await signInAs('Customer');
    const { calls } = installFakeApi({});
    renderApp('/admin/payments/deposits');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Revisión de depósitos' })).toBeNull();
    cleanup();
    renderApp('/admin/payments/cash');
    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path.startsWith('/api/v1/admin/payments'))).toBe(false);
  });
});

describe('the cash payments', () => {
  it('lists the pending cash payments with the branch, the pickup date and the amount to collect', async () => {
    await signInAs('Operator');
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/cash': json(queue([cash()])),
    });
    renderApp('/admin/payments/cash');

    expect(await screen.findByRole('heading', { name: 'Cobros en efectivo' })).toBeDefined();
    expect(await screen.findByText('PED-2030-000008')).toBeDefined();
    expect(screen.getByText(/Luis Gómez/)).toBeDefined();
    expect(screen.getByText('Centro')).toBeDefined();
    expect(screen.getByText('Por cobrar')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirmar cobro' })).toBeDefined();
    const asked = calls.find((call) => call.path === '/api/v1/admin/payments/cash');
    expect(new URLSearchParams(asked?.search).get('status')).toBe('Pending');
    expect(new URLSearchParams(asked?.search).has('search')).toBe(false);
  });

  it('asks for a second step and does nothing until the cash is confirmed', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/cash': json(queue([cash()])),
    });
    renderApp('/admin/payments/cash');

    await user.click(await screen.findByRole('button', { name: 'Confirmar cobro' }));
    expect(await screen.findByText('¿Ya recibió el pago?')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Todavía no' }));

    expect(screen.queryByText('¿Ya recibió el pago?')).toBeNull();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('confirms the cash with an idempotency key and the order is paid', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    let paid = false;
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/cash': () => json(queue(paid ? [] : [cash()])),
      'POST /api/v1/admin/payments/21/confirm-cash': () => {
        paid = true;
        return json({ outcome: 'Approved' });
      },
    });
    renderApp('/admin/payments/cash');

    await user.click(await screen.findByRole('button', { name: 'Confirmar cobro' }));
    await user.click(await screen.findByRole('button', { name: 'Sí, recibí el pago' }));

    expect(await screen.findByText('Cobro confirmado: el pedido quedó pagado.')).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText('PED-2030-000008')).toBeNull();
    });
    expect(
      calls.find((call) => call.method === 'POST')?.headers.get('Idempotency-Key'),
    ).toBeTruthy();
  });

  it('says so when the payment was already confirmed by someone else', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/payments/cash': json(queue([cash()])),
      'POST /api/v1/admin/payments/21/confirm-cash': json({ outcome: 'AlreadyApproved' }),
    });
    renderApp('/admin/payments/cash');

    await user.click(await screen.findByRole('button', { name: 'Confirmar cobro' }));
    await user.click(await screen.findByRole('button', { name: 'Sí, recibí el pago' }));

    expect(await screen.findByText('Ese cobro ya estaba confirmado.')).toBeDefined();
  });

  it('shows the answer of the server when the payment is no longer pending', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/payments/cash': json(queue([cash()])),
      'POST /api/v1/admin/payments/21/confirm-cash': apiError(422, 'PAYMENT_NOT_PENDING'),
    });
    renderApp('/admin/payments/cash');

    await user.click(await screen.findByRole('button', { name: 'Confirmar cobro' }));
    const section = await screen.findByRole('region', { name: '¿Ya recibió el pago?' });
    await user.click(within(section).getByRole('button', { name: 'Sí, recibí el pago' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('searches by the text the customer gives and keeps it in the address', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payments/cash': (call) =>
        new URLSearchParams(call.search).get('search') === 'PED-2030-000008'
          ? json(queue([cash()]))
          : json(queue([cash(), cash({ idPayment: 22, orderNumber: 'PED-2030-000009' })])),
    });
    renderApp('/admin/payments/cash');

    await screen.findByText('PED-2030-000009');
    await user.type(screen.getByLabelText('Buscar un pedido'), ' PED-2030-000008 ');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(screen.queryByText('PED-2030-000009')).toBeNull();
    });
    expect(screen.getByText('PED-2030-000008')).toBeDefined();
    expect(
      calls.some((call) => new URLSearchParams(call.search).get('search') === 'PED-2030-000008'),
    ).toBe(true);
  });

  it('tells apart an empty list from a search without results', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({ 'GET /api/v1/admin/payments/cash': json(queue([])) });
    renderApp('/admin/payments/cash');

    expect(await screen.findByText('No hay cobros aquí')).toBeDefined();
    await user.type(screen.getByLabelText('Buscar un pedido'), 'nadie');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Sin resultados')).toBeDefined();
  });

  it('shows the collected ones as history, with no way to confirm them again', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/payments/cash': (call) =>
        new URLSearchParams(call.search).get('status') === 'Approved'
          ? json(queue([cash({ statusName: 'Approved', idPaymentStatus: 3 })]))
          : json(queue([cash()])),
    });
    renderApp('/admin/payments/cash');

    await user.click(await screen.findByRole('button', { name: 'Cobrados' }));

    expect(await screen.findByText('Cobrado')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Confirmar cobro' })).toBeNull();
  });
});
