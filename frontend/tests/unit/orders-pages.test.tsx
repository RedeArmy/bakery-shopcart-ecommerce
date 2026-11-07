// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { parseOrdersQuery, canCancel } from '../../src/features/orders/model/order-status';
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

const summary = (extra = {}) => ({
  idOrder: 7,
  orderNumber: 'PED-2026-000007',
  statusName: 'PendingPayment',
  total: '145.00',
  createdAt: '2026-11-06T15:00:00Z',
  requestedDeliveryDate: '2030-06-10',
  ...extra,
});

const detail = (extra = {}) => ({
  ...summary(),
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

  it('explains an empty list and offers the catalogue', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/orders': json(page([])) });
    renderApp('/orders');

    expect(await screen.findByText('Todavía no tiene pedidos')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ver el catálogo' }).getAttribute('href')).toBe(
      '/catalogue',
    );
  });

  it('shows the menu entry to customers only', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/orders': json(page([])) });
    renderApp('/orders');
    expect((await screen.findAllByRole('link', { name: 'Mis pedidos' })).length).toBeGreaterThan(0);
  });

  it('does not open to a visitor: it goes to sign in', async () => {
    installFakeApi({});
    renderApp('/orders');
    expect(await screen.findByRole('heading', { name: /iniciar sesión/i })).toBeDefined();
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
        current = detail({ statusName: 'Cancelled' });
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
    installFakeApi({ 'GET /api/v1/orders/7': json(detail({ statusName: 'Dispatched' })) });
    renderApp('/orders/7');

    await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' });
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ver cómo pagar' })).toBeNull();
  });

  it('answers an order that is not the customer’s as one that does not exist', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/orders/9': apiError(404, 'ORDER_NOT_FOUND') });
    renderApp('/orders/9');
    expect(await screen.findByText('Este pedido no existe')).toBeDefined();
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

  it('lets the customer cancel until the order is dispatched', () => {
    expect(['PendingPayment', 'Paid', 'InPreparation'].every(canCancel)).toBe(true);
    expect(['Dispatched', 'Delivered', 'Cancelled', 'Returned'].some(canCancel)).toBe(false);
  });
});
