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

const summary = (extra = {}) => ({
  idOrder: 7,
  orderNumber: 'PED-2030-000007',
  customerName: 'Ana Pérez',
  customerEmail: 'ana@example.test',
  statusName: 'Paid',
  paymentStatusName: 'Approved',
  total: '145.00',
  itemCount: 1,
  createdAt: '2030-06-01T15:00:00Z',
  requestedDeliveryDate: '2030-06-10',
  ...extra,
});

const detail = (extra = {}) => ({
  ...summary(),
  subtotal: '145.00',
  discount: '0.00',
  vat: '15.54',
  fulfilmentType: 'Pickup',
  pickupBranchName: 'Centro',
  pickupBranchAddress: '6a avenida 4-12',
  lines: [
    {
      idOrderLine: 1,
      productName: 'Pastel Tres Leches',
      quantity: 3,
      returnedQuantity: 1,
      unitPrice: '48.33',
      lineTotal: '145.00',
    },
  ],
  history: [{ idNewStatus: 2, newStatusName: 'Paid', createdAt: '2030-06-01T15:00:00Z' }],
  ...extra,
});

const payment = (extra = {}) => ({
  idPayment: 3,
  methodCode: 'CASH',
  methodKind: 'Cash',
  statusName: 'Approved',
  amount: '145.00',
  createdAt: '2030-06-01T15:00:00Z',
  ...extra,
});

const page = (items: unknown[], total = items.length) => ({ items, page: 1, size: 10, total });

describe('the staff order list', () => {
  it('lists the orders of every customer and links each one to its detail', async () => {
    await signInAs('Operator');
    const { calls } = installFakeApi({
      'GET /api/v1/admin/orders': json(
        page([summary(), summary({ idOrder: 8, orderNumber: 'PED-2030-000008' })]),
      ),
    });
    renderApp('/admin/orders');

    expect(await screen.findByRole('heading', { name: 'Gestión de pedidos' })).toBeDefined();
    const first = await screen.findByRole('link', { name: /PED-2030-000007/ });
    expect(first.getAttribute('href')).toBe('/admin/orders/7');
    expect(within(first).getByText(/Ana Pérez/)).toBeDefined();
    expect(within(first).getByText('Pagado')).toBeDefined();
    expect(within(first).getByText('Q145.00')).toBeDefined();

    const asked = calls.find((call) => call.path === '/api/v1/admin/orders');
    const query = new URLSearchParams(asked?.search);
    expect(query.get('size')).toBe('10');
    expect(query.has('status')).toBe(false);
    expect(query.has('search')).toBe(false);
  });

  it('filters by status and by the text searched, and keeps both in the address', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/orders': json(page([summary()])),
    });
    renderApp('/admin/orders');
    await screen.findByText('PED-2030-000007');

    await user.selectOptions(screen.getByLabelText('Estado'), '2');
    await user.type(screen.getByLabelText('Buscar pedido'), 'ana@example.test');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      const last = calls.filter((call) => call.path === '/api/v1/admin/orders').at(-1);
      const query = new URLSearchParams(last?.search);
      expect(query.get('status')).toBe('2');
      expect(query.get('search')).toBe('ana@example.test');
    });
  });

  it('says so when nothing matches', async () => {
    await signInAs('Operator');
    installFakeApi({ 'GET /api/v1/admin/orders': json(page([])) });
    renderApp('/admin/orders?q=nadie');

    expect(await screen.findByText('No hay pedidos con esos datos')).toBeDefined();
  });

  it('keeps the list away from customers', async () => {
    await signInAs('Customer');
    const { calls } = installFakeApi({});
    renderApp('/admin/orders');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path.startsWith('/api/v1/admin/'))).toBe(false);
  });
});

describe('the staff order detail', () => {
  const open = (order: unknown, payments: unknown[] = [payment()], extra = {}) =>
    installFakeApi({
      'GET /api/v1/admin/orders/7': json(order),
      'GET /api/v1/admin/orders/7/payment': json(payments),
      ...extra,
    });

  it('shows who bought, what, how it is received and how it was paid', async () => {
    await signInAs('Operator');
    open(detail());
    renderApp('/admin/orders/7');

    expect(await screen.findByRole('heading', { name: 'Pedido PED-2030-000007' })).toBeDefined();
    expect(screen.getByText(/ana@example.test/)).toBeDefined();
    expect(screen.getByText('Pastel Tres Leches')).toBeDefined();
    expect(screen.getByText('Se devolvió 1 unidad')).toBeDefined();
    expect(screen.getByText('Centro', { exact: false })).toBeDefined();
    expect(await screen.findByText('Efectivo en sucursal')).toBeDefined();
    expect(screen.getByText('Aprobado')).toBeDefined();
  });

  it('offers only the step the status allows and sends it with an idempotency key', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    let status = 'Paid';
    const { calls } = installFakeApi({
      'GET /api/v1/admin/orders/7': () => json(detail({ statusName: status })),
      'GET /api/v1/admin/orders/7/payment': json([payment()]),
      'PATCH /api/v1/admin/orders/7/status': () => {
        status = 'InPreparation';
        return json(detail({ statusName: status }));
      },
    });
    renderApp('/admin/orders/7');

    await user.click(await screen.findByRole('button', { name: 'Pasar a preparación' }));

    // La recogida en sucursal no se despacha: de la preparación pasa a la entrega
    expect(await screen.findByRole('button', { name: 'Marcar como entregado' })).toBeDefined();
    const sent = calls.find((call) => call.method === 'PATCH');
    expect(sent?.body).toEqual({ status: 'InPreparation' });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('dispatches a home delivery order before it is delivered', async () => {
    await signInAs('Administrator');
    open(detail({ statusName: 'InPreparation', fulfilmentType: 'Delivery' }));
    renderApp('/admin/orders/7');

    expect(await screen.findByRole('button', { name: 'Marcar como despachado' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Marcar como entregado' })).toBeNull();
  });

  it('leaves the delivery of a home order to the operators', async () => {
    await signInAs('Administrator');
    open(detail({ statusName: 'Dispatched', fulfilmentType: 'Delivery' }));
    renderApp('/admin/orders/7');

    expect(
      await screen.findByText('La entrega de un pedido a domicilio la marca un operador.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Marcar como entregado' })).toBeNull();
  });

  it('lets an operator mark a home delivery order as delivered', async () => {
    await signInAs('Operator');
    open(detail({ statusName: 'Dispatched', fulfilmentType: 'Delivery' }));
    renderApp('/admin/orders/7');

    expect(await screen.findByRole('button', { name: 'Marcar como entregado' })).toBeDefined();
  });

  it('lets an administrator deliver an order that is collected at a branch', async () => {
    await signInAs('Administrator');
    open(detail({ statusName: 'InPreparation', fulfilmentType: 'Pickup' }));
    renderApp('/admin/orders/7');

    expect(await screen.findByRole('button', { name: 'Marcar como entregado' })).toBeDefined();
  });

  it('shows the reason when the server refuses the step', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    open(detail(), [payment()], {
      'PATCH /api/v1/admin/orders/7/status': apiError(422, 'INVALID_STATE_TRANSITION'),
    });
    renderApp('/admin/orders/7');

    await user.click(await screen.findByRole('button', { name: 'Pasar a preparación' }));

    expect(await screen.findByText('Ese cambio de estado no está permitido.')).toBeDefined();
  });

  it('cancels with its own confirmation step', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = open(detail(), [payment()], {
      'POST /api/v1/orders/7/cancel': json(detail({ statusName: 'Cancelled' })),
    });
    renderApp('/admin/orders/7');

    await user.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await user.type(screen.getByLabelText(/Motivo/), 'El cliente no vendrá');
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
        reason: 'El cliente no vendrá',
      });
    });
  });

  it('offers neither step nor cancellation once the order is delivered, only the return', async () => {
    await signInAs('Operator');
    open(detail({ statusName: 'Delivered' }));
    renderApp('/admin/orders/7');

    expect(await screen.findByRole('button', { name: 'Registrar una devolución' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Marcar como|Pasar a/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
  });

  it('registers a partial return of what is still pending and shows the refund', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = open(detail({ statusName: 'Delivered' }), [payment()], {
      'POST /api/v1/admin/orders/7/returns': json(
        { idReturn: 1, idRefund: 2, refundAmount: '48.33' },
        { status: 201 },
      ),
    });
    renderApp('/admin/orders/7');

    await user.click(await screen.findByRole('button', { name: 'Registrar una devolución' }));
    // Se vendieron 3 y ya se devolvió 1: quedan 2 por devolver
    expect(screen.getByText('Se pueden devolver 2 unidades')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Registrar devolución' }));
    expect(await screen.findByText('Escriba el motivo de la devolución.')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText('Motivo de la devolución'), 'Llegó dañado');
    await user.click(screen.getByRole('button', { name: 'Registrar devolución' }));
    expect(await screen.findByText('Indique al menos una unidad para devolver.')).toBeDefined();

    await user.type(screen.getByLabelText(/Pastel Tres Leches/), '1');
    await user.click(screen.getByRole('button', { name: 'Registrar devolución' }));

    const done = await screen.findByRole('status');
    expect(done.textContent).toContain('Devolución registrada');
    expect(done.textContent).toContain('Q48.33');
    const sent = calls.find((call) => call.method === 'POST');
    expect(sent?.body).toEqual({
      reason: 'Llegó dañado',
      lines: [{ idOrderLine: 1, quantity: 1 }],
    });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('keeps the refund on screen when the return leaves the order fully returned and the form goes away', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const line = (returnedQuantity: number) => ({
      idOrderLine: 1,
      productName: 'Pastel Tres Leches',
      quantity: 3,
      returnedQuantity,
      unitPrice: '48.33',
      lineTotal: '145.00',
    });
    let returned = false;
    installFakeApi({
      'GET /api/v1/admin/orders/7': () =>
        json(
          returned
            ? detail({ statusName: 'Returned', lines: [line(3)] })
            : detail({ statusName: 'Delivered', lines: [line(1)] }),
        ),
      'GET /api/v1/admin/orders/7/payment': json([payment()]),
      'POST /api/v1/admin/orders/7/returns': () => {
        returned = true;
        return json({ idReturn: 1, idRefund: 2, refundAmount: '96.67' }, { status: 201 });
      },
    });
    renderApp('/admin/orders/7');

    await user.click(await screen.findByRole('button', { name: 'Registrar una devolución' }));
    await user.type(screen.getByLabelText('Motivo de la devolución'), 'Llegó dañado');
    await user.type(screen.getByLabelText(/Pastel Tres Leches/), '2');
    await user.click(screen.getByRole('button', { name: 'Registrar devolución' }));

    // Con todo devuelto el pedido ya no admite devoluciones, pero el reembolso sigue a la vista
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Registrar devolución' })).toBeNull();
    });
    expect((await screen.findByRole('status')).textContent).toContain('Q96.67');
  });

  it('does not let more units than the pending ones be returned', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = open(detail({ statusName: 'Delivered' }));
    renderApp('/admin/orders/7');

    await user.click(await screen.findByRole('button', { name: 'Registrar una devolución' }));
    await user.type(screen.getByLabelText('Motivo de la devolución'), 'Motivo');
    await user.type(screen.getByLabelText(/Pastel Tres Leches/), '3');
    await user.click(screen.getByRole('button', { name: 'Registrar devolución' }));

    expect(await screen.findByText(/no pasen|no pase de lo que se puede devolver/)).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('offers no return when everything was already returned', async () => {
    await signInAs('Operator');
    open(
      detail({
        statusName: 'Returned',
        lines: [
          {
            idOrderLine: 1,
            productName: 'Pastel Tres Leches',
            quantity: 3,
            returnedQuantity: 3,
            unitPrice: '48.33',
            lineTotal: '145.00',
          },
        ],
      }),
    );
    renderApp('/admin/orders/7');

    await screen.findByRole('heading', { name: 'Pedido PED-2030-000007' });
    expect(screen.queryByRole('button', { name: 'Registrar una devolución' })).toBeNull();
  });

  it('says the order does not exist when the server answers 404', async () => {
    await signInAs('Operator');
    installFakeApi({ 'GET /api/v1/admin/orders/7': apiError(404, 'NOT_FOUND') });
    renderApp('/admin/orders/7');

    expect(await screen.findByText('Este pedido no existe')).toBeDefined();
  });

  it('treats an address that is not a number as a missing order without asking the server', async () => {
    await signInAs('Operator');
    const { calls } = installFakeApi({});
    renderApp('/admin/orders/abc');

    expect(await screen.findByText('Este pedido no existe')).toBeDefined();
    expect(calls.some((call) => call.path.startsWith('/api/v1/admin/orders/'))).toBe(false);
  });
});
