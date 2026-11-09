// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import {
  allows,
  displayStatus,
  parseOrdersQuery,
} from '../../src/features/orders/model/order-status';
import { apiError, installFakeApi, json } from './support/fake-api';
import { renderApp, resetSession, signInAs, signInAsGuest } from './support/render';

beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const summary = (extra = {}) => ({
  idOrder: 7,
  orderNumber: 'PED-2026-000007',
  statusName: 'PendingPayment',
  total: '145.00',
  createdAt: '2026-11-06T15:00:00Z',
  requestedDeliveryDate: '2030-06-10',
  ...extra,
});

// Lo que el servidor ofrece sobre el pedido: uno pendiente de pago solo se puede cancelar
const detail = (extra = {}) => ({
  ...summary(),
  allowedActions: ['Cancel'],
  operatorOnlyActions: [],
  subtotal: '145.00',
  discount: '0.00',
  vat: '15.54',
  deliveryRecipient: 'Ana Pérez',
  deliveryPhone: '5555-1234',
  deliveryLine1: '5a avenida 10-20',
  deliveryMunicipality: 'Guatemala',
  deliveryDepartment: 'Guatemala',
  lines: [
    {
      idOrderLine: 1,
      productName: 'Pastel Tres Leches',
      attributes: 'Mediano',
      quantity: 1,
      unitPrice: '145.00',
      lineTotal: '145.00',
      inscription: 'Feliz cumpleaños',
    },
  ],
  history: [{ idNewStatus: 1, newStatusName: 'PendingPayment', createdAt: '2026-11-06T15:00:00Z' }],
  ...extra,
});

const page = (items: unknown[], total = items.length) => ({ items, page: 1, size: 10, total });

describe('the order list', () => {
  it('lists the orders with their status and total, and links to each one', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders': json(
        page([
          summary(),
          summary({ idOrder: 8, orderNumber: 'PED-2026-000008', statusName: 'Delivered' }),
        ]),
      ),
    });
    renderApp('/orders');

    expect(await screen.findByRole('heading', { name: 'Mis pedidos' })).toBeDefined();
    expect(await screen.findByText('PED-2026-000007')).toBeDefined();
    // Los estados también son opciones del filtro: se mira cada tarjeta
    const first = screen.getByRole('link', { name: /PED-2026-000007/ });
    expect(within(first).getByText('Pendiente de pago')).toBeDefined();
    expect(within(first).getByText('Q145.00')).toBeDefined();
    expect(first.getAttribute('href')).toBe('/orders/7');
    const second = screen.getByRole('link', { name: /PED-2026-000008/ });
    expect(within(second).getByText('Entregado')).toBeDefined();
  });

  it('asks the server for the chosen status and keeps it in the address', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/orders': json(page([summary()])) });
    renderApp('/orders');
    await screen.findByText('PED-2026-000007');

    await user.selectOptions(screen.getByLabelText('Estado'), 'Cancelado');

    await waitFor(() => {
      expect(calls.some((call) => call.search.includes('status=6'))).toBe(true);
    });
  });

  it('explains an empty list inside an account and offers the catalogue', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/orders': json(page([])) });
    renderApp('/orders');

    expect(await screen.findByText('Todavía no tiene pedidos')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ver el catálogo' }).getAttribute('href')).toBe(
      '/catalogue',
    );
    // Dentro de la cuenta la página es «Mis pedidos» y no pide número ni correo
    expect(screen.getByRole('heading', { level: 1, name: 'Mis pedidos' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Consulte su pedido' })).toBeNull();
  });

  it('shows all the orders of an account under the title Mis pedidos', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/orders': json(page([summary()])) });
    renderApp('/orders');

    expect(await screen.findByRole('heading', { level: 1, name: 'Mis pedidos' })).toBeDefined();
    expect(await screen.findByText('PED-2026-000007')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Consulte su pedido' })).toBeNull();
  });

  it('calls the menu entry Mis pedidos inside an account', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/orders': json(page([])) });
    renderApp('/orders');
    expect((await screen.findAllByRole('link', { name: 'Mis pedidos' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Pedidos' })).toBeNull();
  });

  it('gives a guest the lookup and, below it, only the orders of the session when there are any', async () => {
    await signInAsGuest();
    installFakeApi({ 'GET /api/v1/orders': json(page([summary()])) });
    renderApp('/orders');

    expect(await screen.findByRole('heading', { level: 1, name: 'Pedidos' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Consulte su pedido' })).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Sus pedidos' })).toBeDefined();
    // El invitado no está en una cuenta: el enlace es el público
    expect(screen.queryByRole('link', { name: 'Mis pedidos' })).toBeNull();
  });

  it('opens to a visitor with the lookup only, and the public entry is called Pedidos', async () => {
    const { calls } = installFakeApi({});
    renderApp('/orders');

    expect(await screen.findByRole('heading', { level: 1, name: 'Pedidos' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Consulte su pedido' })).toBeDefined();
    expect((await screen.findAllByRole('link', { name: 'Pedidos' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Mis pedidos' })).toBeNull();
    // Sin sesión no se pide ninguna lista
    expect(calls.some((call) => call.path === '/api/v1/orders')).toBe(false);
  });
});

describe('the order detail', () => {
  it('shows the lines with the inscription, the delivery, the history and the payment link while it waits', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/orders/7': json(detail()) });
    renderApp('/orders/7');

    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' })).toBeDefined();
    expect(screen.getByText('Pastel Tres Leches')).toBeDefined();
    expect(screen.getByText('Mensaje: Feliz cumpleaños')).toBeDefined();
    expect(screen.getByText(/5a avenida 10-20/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ver cómo pagar' }).getAttribute('href')).toBe(
      '/orders/7/payment',
    );
    // Sin descuento no hay línea de descuento
    expect(screen.queryByText(/^Descuento/)).toBeNull();
  });

  it('cancels after an explicit confirmation, with an idempotency key and the reason', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    let current = detail();
    const { calls } = installFakeApi({
      'GET /api/v1/orders/7': () => json(current),
      'POST /api/v1/orders/7/cancel': () => {
        current = detail({ statusName: 'Cancelled', allowedActions: [] });
        return json(current);
      },
    });
    renderApp('/orders/7');

    await user.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    // Nada se envía hasta confirmar
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await user.type(screen.getByLabelText(/Motivo/), 'Cambié de idea');
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }));

    expect(await screen.findByText('Cancelado')).toBeDefined();
    const sent = calls.find((call) => call.method === 'POST');
    expect(sent?.body).toEqual({ reason: 'Cambié de idea' });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
  });

  it('does not offer to cancel an order that was dispatched', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(detail({ statusName: 'Dispatched', allowedActions: [] })),
    });
    renderApp('/orders/7');

    await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' });
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ver cómo pagar' })).toBeNull();
  });

  it('shows the cancellation when the server offers it and not by working the status out', async () => {
    await signInAs('Customer');
    // El estado diría «pagado», pero el servidor no ofrece cancelar: la pantalla no lo contradice
    installFakeApi({
      'GET /api/v1/orders/7': json(detail({ statusName: 'Paid', allowedActions: [] })),
    });
    renderApp('/orders/7');

    await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' });
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
  });

  it('answers an order that is not the customer’s as one that does not exist', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/orders/9': apiError(404, 'ORDER_NOT_FOUND') });
    renderApp('/orders/9');
    expect(await screen.findByText('Este pedido no existe')).toBeDefined();
  });
});

describe('the order as the customer follows it', () => {
  it('shows the delivery notes, the deposit review notice and every state of the timeline', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(
        detail({
          deliveryNotes: 'Tocar el timbre dos veces',
          history: [
            { idNewStatus: 1, newStatusName: 'PendingPayment', createdAt: '2026-11-06T15:00:00Z' },
            { idNewStatus: 2, newStatusName: 'Paid', createdAt: '2026-11-07T10:00:00Z' },
          ],
        }),
      ),
    });
    renderApp('/orders/7');

    expect(await screen.findByText(/Tocar el timbre dos veces/)).toBeDefined();
    // El aviso espera a saber con qué se paga: llega después del encabezado
    expect(await screen.findByText(/una persona lo revisará con el banco/)).toBeDefined();
    expect(screen.getAllByText('Pagado').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Repetir/ })).toBeNull();
  });
});

describe('a pickup order', () => {
  it('shows the branch instead of a delivery address', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(
        detail({
          fulfilmentType: 'Pickup',
          idBranch: 5,
          pickupBranchName: 'Sucursal Centro',
          pickupBranchAddress: '6a avenida 10-20, Guatemala, Guatemala',
          deliveryRecipient: null,
          deliveryPhone: null,
          deliveryLine1: null,
          deliveryMunicipality: null,
          deliveryDepartment: null,
        }),
      ),
    });
    renderApp('/orders/7');

    expect(await screen.findByRole('heading', { name: 'Recoger en sucursal' })).toBeDefined();
    expect(screen.getByText(/Sucursal Centro/)).toBeDefined();
    expect(screen.getByText(/6a avenida 10-20, Guatemala, Guatemala/)).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Entrega' })).toBeNull();
    // La fecha se presenta como una estimación
    expect(screen.getByText(/fecha estimada/)).toBeDefined();
  });
});

describe('the order list query', () => {
  it('ignores a page or a status that is not valid', () => {
    expect(parseOrdersQuery(new URLSearchParams('page=0&status=99'))).toEqual({
      page: 1,
      status: null,
    });
    expect(parseOrdersQuery(new URLSearchParams('page=3&status=6'))).toEqual({
      page: 3,
      status: 6,
    });
  });

  it('reads an action from what the server offers and from nothing else', () => {
    expect(allows({ allowedActions: ['Cancel'] }, 'Cancel')).toBe(true);
    expect(allows({ allowedActions: ['Cancel', 'Prepare'] }, 'Prepare')).toBe(true);
    expect(allows({ allowedActions: [] }, 'Cancel')).toBe(false);
    expect(allows({ allowedActions: ['Return'] }, 'Cancel')).toBe(false);
  });
});

describe('the status the customer sees when a proof is waiting to be checked', () => {
  it('says the payment is pending verification once the proof arrived, and only then', () => {
    expect(displayStatus('PendingPayment', 'UnderReview')).toBe('PaymentUnderReview');
    // Sin comprobante, con un depósito rechazado o en efectivo sigue siendo pendiente de pago
    expect(displayStatus('PendingPayment', 'Pending')).toBe('PendingPayment');
    expect(displayStatus('PendingPayment', 'Rejected')).toBe('PendingPayment');
    expect(displayStatus('PendingPayment', null)).toBe('PendingPayment');
    // Los demás estados no cambian
    expect(displayStatus('Paid', 'Approved')).toBe('Paid');
    expect(displayStatus('Cancelled', 'UnderReview')).toBe('Cancelled');
  });

  it('shows it in the list, the detail and the timeline', async () => {
    await signInAs('Customer');
    const verifying = {
      paymentStatusName: 'UnderReview',
      history: [
        { idNewStatus: 1, newStatusName: 'PendingPayment', createdAt: '2026-11-06T15:00:00Z' },
        { newStatusName: 'PaymentUnderReview', createdAt: '2026-11-06T16:00:00Z' },
      ],
    };
    installFakeApi({
      'GET /api/v1/orders': json(page([summary({ paymentStatusName: 'UnderReview' })])),
      'GET /api/v1/orders/7': json(detail(verifying)),
    });
    renderApp('/orders');
    const card = await screen.findByRole('link', { name: /PED-2026-000007/ });
    expect(within(card).getByText('Pendiente de verificación de pago')).toBeDefined();
    expect(within(card).queryByText('Pendiente de pago')).toBeNull();
    cleanup();

    renderApp('/orders/7');
    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' })).toBeDefined();
    // La insignia y el último momento de la línea de tiempo lo dicen; el aviso explica qué sigue
    expect(screen.getAllByText('Pendiente de verificación de pago').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(await screen.findByText(/Una persona lo está verificando con el banco/)).toBeDefined();
  });
});

describe('what the order detail says about paying', () => {
  const payment = (extra = {}) => ({
    idPayment: 1,
    isCurrent: true,
    statusName: 'Pending',
    amount: '145.00',
    ...extra,
  });

  it('talks about paying in cash in the branch when the payment is in cash', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(detail({ paymentStatusName: 'Pending' })),
      'GET /api/v1/orders/7/payment': json([payment({ methodKind: 'Cash' })]),
    });
    renderApp('/orders/7');

    expect(
      await screen.findByText(/reservado hasta que llegue a la sucursal y pague en efectivo/),
    ).toBeDefined();
    expect(screen.queryByText(/Cuando suba su comprobante/)).toBeNull();
  });

  it('keeps the deposit notice for a deposit and the verification notice once the proof arrived', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(detail({ paymentStatusName: 'Pending' })),
      'GET /api/v1/orders/7/payment': json([payment({ methodKind: 'Deposit' })]),
    });
    renderApp('/orders/7');
    expect(await screen.findByText(/Cuando suba su comprobante/)).toBeDefined();
    cleanup();

    installFakeApi({
      'GET /api/v1/orders/7': json(detail({ paymentStatusName: 'UnderReview' })),
      'GET /api/v1/orders/7/payment': json([
        payment({ methodKind: 'Deposit', statusName: 'UnderReview' }),
      ]),
    });
    renderApp('/orders/7');
    expect(await screen.findByText(/Una persona lo está verificando con el banco/)).toBeDefined();
  });
});
