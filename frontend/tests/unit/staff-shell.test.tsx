// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { installFakeApi, json, session } from './support/fake-api';
import { category, page, renderApp, resetSession, signInAs } from './support/render';

// Las rutas se cargan bajo demanda y el router no cambia de dirección hasta tenerlas: se precargan para que ninguna prueba espere
// la primera importación, y la del panel trae además la librería de gráficas
beforeAll(async () => {
  await Promise.all([
    import('../../src/features/dashboard/pages/dashboard-page'),
    import('../../src/features/catalogue/pages/catalogue-page'),
    import('../../src/features/catalogue/pages/product-page'),
    import('../../src/features/cart/pages/cart-page'),
    import('../../src/features/checkout/pages/checkout-page'),
    import('../../src/features/staff-orders/pages/staff-orders-page'),
  ]);
}, 60_000);

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const shop = {
  'GET /api/v1/categories': json([category(1, 'Pasteles')]),
  'GET /api/v1/products': json(page([])),
  'GET /api/v1/cart': json({ items: [], subtotal: '0.00', discount: '0.00', total: '0.00' }),
};

/** El panel de cualquiera de los dos roles pide estas consultas; se responden vacías para que solo importe lo que se ve. */
const panel = {
  'GET /api/v1/admin/dashboard/summary': json({
    fromDate: '2030-06-01',
    toDate: '2030-06-30',
    orders: 0,
    gross: '0.00',
    returned: '0.00',
    net: '0.00',
    averageTicket: '0.00',
    pendingPaymentOrders: 0,
    depositsUnderReview: 0,
    abandonedCarts: 0,
  }),
  'GET /api/v1/admin/dashboard/sales': json([]),
  'GET /api/v1/admin/dashboard/sales-by-category': json([]),
  'GET /api/v1/admin/dashboard/top-products': json([]),
  'GET /api/v1/admin/orders': json({ items: [], page: 1, size: 10, total: 0 }),
  'GET /api/v1/admin/payments/deposits': json({ items: [], page: 1, size: 10, total: 0 }),
  'GET /api/v1/admin/payments/cash': json({ items: [], page: 1, size: 10, total: 0 }),
};

const ANNOUNCEMENT = /Pasteles por encargo: cada producto indica/;

describe.each(['Operator', 'Administrator'] as const)('the %s', (role) => {
  it('lands on the dashboard after signing in, not on the shop', async () => {
    installFakeApi({
      'POST /api/v1/auth/login': json(session('Eder Garcia', role)),
      ...shop,
      ...panel,
    });
    const { router } = renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'staff@shopcart.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin');
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola Eder' })).toBeDefined();
  });

  it('goes back to where they were heading when the sign in came from a staff screen', async () => {
    installFakeApi({ 'POST /api/v1/auth/login': json(session('Eder Garcia', role)), ...panel });
    const { router } = renderApp({ pathname: '/login', state: { from: '/admin/orders?status=2' } });
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'staff@shopcart.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin/orders');
    });
    expect(router.state.location.search).toBe('?status=2');
  });

  it('sees no shop links, no cart and no announcement, only the staff menu', async () => {
    await signInAs(role);
    installFakeApi({ ...shop, ...panel });
    renderApp('/admin');
    await screen.findByRole('heading', { level: 1, name: 'Hola Ana' });

    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).queryByRole('link', { name: 'Catálogo' })).toBeNull();
    expect(within(header).queryByRole('link', { name: 'Pedidos' })).toBeNull();
    expect(within(header).queryByRole('link', { name: 'Mis pedidos' })).toBeNull();
    expect(within(header).queryByRole('link', { name: /Carrito/ })).toBeNull();
    expect(screen.queryByText(ANNOUNCEMENT)).toBeNull();
    // Su menú sí está, con el panel primero
    expect(within(header).getByRole('link', { name: 'Panel' })).toBeDefined();
    expect(within(header).getByRole('link', { name: 'Gestión de pedidos' })).toBeDefined();
    // Y el pie no les ofrece la tienda
    expect(screen.queryByRole('navigation', { name: 'Tienda' })).toBeNull();
  });

  it.each(['/', '/catalogue', '/catalogue/3', '/cart', '/checkout'])(
    'is taken to the dashboard when they open %s',
    async (path) => {
      await signInAs(role);
      installFakeApi({ ...shop, ...panel });
      const { router } = renderApp(path);
      await waitFor(
        () => {
          expect(router.state.location.pathname).toBe('/admin');
        },
        { timeout: 10_000 },
      );
      expect(await screen.findByRole('heading', { level: 1, name: 'Hola Ana' })).toBeDefined();
    },
    30_000,
  );

  it('has the logo lead to the dashboard', async () => {
    await signInAs(role);
    installFakeApi({ ...shop, ...panel });
    renderApp('/admin/orders');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Pastelería' }).getAttribute('href')).toBe(
      '/admin',
    );
  });
});

describe('the customer and the visitor', () => {
  it('keep the shop, the cart and the announcement', async () => {
    await signInAs('Customer');
    installFakeApi(shop);
    renderApp('/');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getAllByRole('link', { name: 'Catálogo' }).length).toBeGreaterThan(0);
    expect(within(header).getAllByRole('link', { name: 'Mis pedidos' }).length).toBeGreaterThan(0);
    expect(within(header).getByRole('link', { name: /Carrito/ })).toBeDefined();
    expect(screen.getByText(ANNOUNCEMENT)).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Tienda' })).toBeDefined();
    expect(within(header).getByRole('link', { name: 'Pastelería' }).getAttribute('href')).toBe('/');
  });

  it('are not sent to a dashboard they cannot see', async () => {
    installFakeApi(shop);
    const { router } = renderApp('/');
    await screen.findAllByRole('banner');
    expect(router.state.location.pathname).toBe('/');
  });
});
