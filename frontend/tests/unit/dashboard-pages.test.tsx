// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastDays } from '../../src/features/dashboard/model/dashboard';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import type { Call } from './support/fake-api';
import { renderApp, resetSession, signInAs } from './support/render';

// La ruta del panel se carga bajo demanda y trae la librería de gráficas: la primera vez tarda más que la espera de una consulta
beforeAll(async () => {
  await import('../../src/features/dashboard/pages/dashboard-page');
}, 60_000);

beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const summary = (extra = {}) => ({
  fromDate: '2030-06-01',
  toDate: '2030-06-30',
  orders: 12,
  gross: '2500.00',
  returned: '250.00',
  net: '2250.00',
  averageTicket: '187.50',
  pendingPaymentOrders: 3,
  depositsUnderReview: 2,
  abandonedCarts: 4,
  ...extra,
});

const point = (day: string, orders: number, net: string) => ({
  periodStart: day,
  orders,
  gross: net,
  returned: '0.00',
  net,
  averageTicket: net,
});

const order = (extra = {}) => ({
  idOrder: 7,
  orderNumber: 'PED-2030-000007',
  customerName: 'Ana Pérez',
  customerEmail: 'ana@example.test',
  statusName: 'Paid',
  paymentStatusName: 'Approved',
  total: '145.00',
  itemCount: 1,
  createdAt: '2030-06-01T15:00:00Z',
  ...extra,
});

const ordersPage = (items: unknown[], total = items.length) => ({
  items,
  page: 1,
  size: 10,
  total,
});

/** El servidor falso de un administrador con datos en todos los reportes. */
const adminApi = (extra: Record<string, Parameters<typeof installFakeApi>[0][string]> = {}) =>
  installFakeApi({
    'GET /api/v1/admin/dashboard/summary': json(summary()),
    'GET /api/v1/admin/dashboard/sales': json([
      point('2030-06-10', 4, '800.00'),
      point('2030-06-11', 8, '1450.00'),
    ]),
    'GET /api/v1/admin/dashboard/sales-by-category': json([
      { idCategory: 1, categoryName: 'Pasteles', orders: 9, units: 14, net: '1900.00' },
      { idCategory: 2, categoryName: 'Galletas', orders: 3, units: 1, net: '350.00' },
    ]),
    'GET /api/v1/admin/dashboard/top-products': json([
      { position: 1, idProduct: 1, productName: 'Pastel Tres Leches', units: 10, net: '1450.00' },
      { position: 2, idProduct: 2, productName: 'Galletas de avena', units: 6, net: '270.00' },
    ]),
    'GET /api/v1/admin/orders': json(ordersPage([order()], 12)),
    ...extra,
  });

const lastCall = (calls: Call[], path: string): Call | undefined =>
  calls.filter((call) => call.path === path).at(-1);

describe('the administrator dashboard', () => {
  it('shows the figures, the sales, the categories, the best sellers and the orders of the period', async () => {
    await signInAs('Administrator');
    const { calls } = adminApi();
    renderApp('/admin');

    expect(await screen.findByRole('heading', { level: 1, name: 'Hola Ana' })).toBeDefined();

    const summarySection = await screen.findByRole('region', { name: 'Resumen del período' });
    // La sección aparece con su título mientras llegan los datos: se espera la primera cifra
    expect(await within(summarySection).findByText('Q2,250.00')).toBeDefined();
    expect(within(summarySection).getByText('Q2,500.00')).toBeDefined();
    expect(within(summarySection).getByText('Q250.00')).toBeDefined();
    expect(within(summarySection).getByText('Q187.50')).toBeDefined();
    expect(within(summarySection).getByText('12')).toBeDefined();
    // Lo pendiente ahora lleva a donde se atiende
    expect(
      within(summarySection)
        .getByRole('link', { name: /Depósitos en revisión/ })
        .getAttribute('href'),
    ).toBe('/admin/payments/deposits');
    expect(
      within(summarySection)
        .getByRole('link', { name: /Pedidos por pagar/ })
        .getAttribute('href'),
    ).toBe('/admin/orders?status=1');

    const sales = await screen.findByRole('region', { name: 'Ventas por período' });
    expect(within(sales).getByText('Q1,450.00')).toBeDefined();
    expect(within(sales).getByRole('table')).toBeDefined();

    const categories = await screen.findByRole('region', { name: 'Ventas por categoría' });
    expect(within(categories).getByText('Pasteles')).toBeDefined();
    expect(within(categories).getByText(/^14 unidades/)).toBeDefined();
    expect(within(categories).getByText(/^1 unidad ·/)).toBeDefined();

    const top = await screen.findByRole('region', { name: 'Los 10 productos más vendidos' });
    expect(within(top).getByText('Pastel Tres Leches')).toBeDefined();

    const recent = await screen.findByRole('region', { name: 'Pedidos del período' });
    expect(within(recent).getByRole('link', { name: /PED-2030-000007/ })).toBeDefined();
    expect(
      within(recent)
        .getByRole('link', { name: 'Ver todos los pedidos del período' })
        .getAttribute('href'),
    ).toBe('/admin/orders?from=2030-06-01&to=2030-06-30');

    // Sin fechas el servidor decide el período; los pedidos usan las fechas que él resolvió, de medianoche a medianoche
    expect(lastCall(calls, '/api/v1/admin/dashboard/summary')?.search).toBe('');
    const ordersQuery = new URLSearchParams(lastCall(calls, '/api/v1/admin/orders')?.search);
    expect(ordersQuery.get('from')).toBe('2030-06-01T00:00:00-06:00');
    expect(ordersQuery.get('to')).toBe('2030-07-01T06:00:00.000Z');
  });

  it('asks for the last days of a preset and shows it as the chosen one', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = adminApi();
    renderApp('/admin');

    const preset = await screen.findByRole('button', { name: 'Últimos 7 días' });
    expect(preset.getAttribute('aria-pressed')).toBe('false');
    await user.click(preset);

    await waitFor(() => {
      const query = new URLSearchParams(lastCall(calls, '/api/v1/admin/dashboard/sales')?.search);
      expect(query.get('from')).toBe(lastDays(7).from);
      expect(query.get('to')).toBeNull();
    });
    expect(
      (await screen.findByRole('button', { name: 'Últimos 7 días' })).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('groups the sales by the chosen period', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = adminApi();
    renderApp('/admin');

    await user.selectOptions(await screen.findByLabelText('Agrupar por'), 'month');

    await waitFor(() => {
      const query = new URLSearchParams(lastCall(calls, '/api/v1/admin/dashboard/sales')?.search);
      expect(query.get('granularity')).toBe('month');
    });
  });

  it('reads the period from the address', async () => {
    await signInAs('Administrator');
    const { calls } = adminApi();
    renderApp('/admin?from=2030-05-01&to=2030-05-31&granularity=week');

    await screen.findByRole('region', { name: 'Ventas por período' });
    const query = new URLSearchParams(lastCall(calls, '/api/v1/admin/dashboard/sales')?.search);
    expect(query.get('from')).toBe('2030-05-01');
    expect(query.get('to')).toBe('2030-05-31');
    expect(query.get('granularity')).toBe('week');
  });

  it('explains a period that is reversed and does not ask the server', async () => {
    await signInAs('Administrator');
    const { calls } = adminApi();
    renderApp('/admin?from=2030-06-10&to=2030-06-01');

    expect(
      await screen.findByText('La fecha «Desde» no puede ser posterior a «Hasta».'),
    ).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Ventas por período' })).toBeNull();
    expect(calls.some((call) => call.path.startsWith('/api/v1/admin/dashboard/'))).toBe(false);
  });

  it('says so when there were no sales, no categories and no best sellers', async () => {
    await signInAs('Administrator');
    adminApi({
      'GET /api/v1/admin/dashboard/sales': json([]),
      'GET /api/v1/admin/dashboard/sales-by-category': json([]),
      'GET /api/v1/admin/dashboard/top-products': json([]),
      'GET /api/v1/admin/orders': json(ordersPage([])),
    });
    renderApp('/admin');

    expect(await screen.findByText('No hubo ventas en este período.')).toBeDefined();
    expect(screen.getByText('No hubo ventas por categoría en este período.')).toBeDefined();
    expect(screen.getByText('No hubo productos vendidos en este período.')).toBeDefined();
    expect(await screen.findByText('No hubo pedidos en este período.')).toBeDefined();
  });

  it('shows the error of one report and lets it retry without hiding the others', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let failing = true;
    adminApi({
      'GET /api/v1/admin/dashboard/sales': () => {
        if (failing) return apiError(500, 'INTERNAL_ERROR');
        return json([point('2030-06-10', 4, '800.00')]);
      },
    });
    renderApp('/admin');

    const sales = await screen.findByRole('region', { name: 'Ventas por período' });
    expect(await within(sales).findByRole('alert')).toBeDefined();
    // Lo demás sigue a la vista
    expect(await screen.findByText('Pasteles')).toBeDefined();

    failing = false;
    await user.click(within(sales).getByRole('button', { name: 'Reintentar' }));

    expect(await within(sales).findByText('Q800.00')).toBeDefined();
  });

  it('keeps the reports away from customers', async () => {
    await signInAs('Customer');
    const { calls } = adminApi();
    renderApp('/admin');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path.startsWith('/api/v1/admin/'))).toBe(false);
  });
});

describe('the operator dashboard', () => {
  /** Cada cola de pedidos responde según el estado que se le pide. */
  const operatorApi = () =>
    installFakeApi({
      'GET /api/v1/admin/orders': (call) => {
        const status = new URLSearchParams(call.search).get('status');
        if (status === '2') {
          return json(
            ordersPage([order(), order({ idOrder: 8, orderNumber: 'PED-2030-000008' })], 7),
          );
        }
        if (status === '3') return json(ordersPage([], 2));
        return json(
          ordersPage(
            [order({ idOrder: 9, orderNumber: 'PED-2030-000009', statusName: 'Dispatched' })],
            4,
          ),
        );
      },
      'GET /api/v1/admin/payments/deposits': json({ items: [], page: 1, size: 10, total: 5 }),
      'GET /api/v1/admin/payments/cash': json({ items: [], page: 1, size: 10, total: 1 }),
    });

  it('shows what needs attention now, with each figure leading to its screen', async () => {
    await signInAs('Operator');
    operatorApi();
    renderApp('/admin');

    expect(await screen.findByRole('heading', { level: 1, name: 'Hola Ana' })).toBeDefined();

    const toPrepare = await screen.findByRole('link', { name: /Por preparar/ });
    await waitFor(() => {
      expect(within(toPrepare).getByText('7')).toBeDefined();
    });
    expect(toPrepare.getAttribute('href')).toBe('/admin/orders?status=2');
    expect(
      within(screen.getByRole('link', { name: /En preparación/ })).getByText('2'),
    ).toBeDefined();
    const dispatched = screen.getByRole('link', { name: /Despachados por entregar/ });
    expect(within(dispatched).getByText('4')).toBeDefined();
    expect(dispatched.getAttribute('href')).toBe('/admin/orders?status=4');
    const deposits = screen.getByRole('link', { name: /Depósitos en revisión/ });
    expect(within(deposits).getByText('5')).toBeDefined();
    expect(deposits.getAttribute('href')).toBe('/admin/payments/deposits');
    const cash = screen.getByRole('link', { name: /Cobros en efectivo pendientes/ });
    expect(within(cash).getByText('1')).toBeDefined();
    expect(cash.getAttribute('href')).toBe('/admin/payments/cash');
  });

  it('lists the orders to prepare and the dispatched ones, with a link to each full list', async () => {
    await signInAs('Operator');
    operatorApi();
    renderApp('/admin');

    const prepare = await screen.findByRole('region', { name: 'Por preparar' });
    expect(await within(prepare).findByRole('link', { name: /PED-2030-000007/ })).toBeDefined();
    expect(within(prepare).getByRole('link', { name: /PED-2030-000008/ })).toBeDefined();
    expect(within(prepare).getByRole('link', { name: 'Ver todos (7)' }).getAttribute('href')).toBe(
      '/admin/orders?status=2',
    );

    const dispatched = await screen.findByRole('region', { name: 'Despachados por entregar' });
    expect(await within(dispatched).findByRole('link', { name: /PED-2030-000009/ })).toBeDefined();
  });

  it('does not ask for the sales reports, which are the administrator’s', async () => {
    await signInAs('Operator');
    const { calls } = operatorApi();
    renderApp('/admin');

    await screen.findByRole('region', { name: 'Por preparar' });
    expect(calls.some((call) => call.path.startsWith('/api/v1/admin/dashboard/'))).toBe(false);
    expect(screen.queryByRole('region', { name: 'Ventas por período' })).toBeNull();
  });

  it('says so when there is nothing to attend', async () => {
    await signInAs('Operator');
    installFakeApi({
      'GET /api/v1/admin/orders': json(ordersPage([])),
      'GET /api/v1/admin/payments/deposits': json({ items: [], page: 1, size: 10, total: 0 }),
      'GET /api/v1/admin/payments/cash': json({ items: [], page: 1, size: 10, total: 0 }),
    });
    renderApp('/admin');

    const prepare = await screen.findByRole('region', { name: 'Por preparar' });
    expect(await within(prepare).findByText('No hay nada pendiente aquí.')).toBeDefined();
  });
});
