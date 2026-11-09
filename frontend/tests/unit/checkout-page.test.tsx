// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import type { Call } from './support/fake-api';
import { getGuestToken } from '../../src/features/cart/model/guest-token';
import { renderApp, resetSession, signInAs } from './support/render';

// El personal que llega al pago vuelve a su panel, una ruta que se carga bajo demanda y trae la librería de gráficas: se precarga
// para que la prueba no espere la primera importación
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

const line = (idVariant: number, name: string, quantity: number, extra = {}) => ({
  idCartItem: idVariant * 10,
  idVariant,
  sku: `SKU-${idVariant}`,
  productName: name,
  quantity,
  inscription: null,
  unitPrice: '145.00',
  lineTotal: '145.00',
  available: 20,
  isAvailable: true,
  ...extra,
});

const cartOf = (lines: ReturnType<typeof line>[]) => ({
  idCart: 5,
  couponCode: null,
  couponReason: null,
  subtotal: '290.00',
  discount: '0.00',
  total: '290.00',
  vat: '31.07',
  taxableBase: '258.93',
  itemCount: lines.reduce((sum, item) => sum + item.quantity, 0),
  hasUnavailableLines: false,
  lines,
});

const putsTo = (calls: Call[], path: string) =>
  calls.filter((call) => call.method === 'PUT' && call.path === path);

describe('checkout access', () => {
  it('lets a visitor with a cart choose between buying as a guest and signing in', async () => {
    getGuestToken();
    installFakeApi({ 'GET /api/v1/cart': json(cartOf([line(11, 'Pastel Tres Leches', 1)])) });
    renderApp('/checkout');
    expect(await screen.findByRole('heading', { name: '¿Cómo quiere pagar?' })).toBeDefined();
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('button', { name: 'Continuar como invitado' })).toBeDefined();
    // El mismo camino aparece al elegir y en el aviso de que la personalización necesita una cuenta
    for (const link of main.getAllByRole('link', { name: 'Iniciar sesión' })) {
      expect(link.getAttribute('href')).toBe('/login');
    }
    for (const link of main.getAllByRole('link', { name: 'Crear cuenta' })) {
      expect(link.getAttribute('href')).toBe('/register');
    }
    expect(main.getByText('La personalización necesita una cuenta')).toBeDefined();
  });

  it('does not open the payment to staff accounts: they do not buy, so they go back to their dashboard', async () => {
    await signInAs('Administrator');
    const { calls } = installFakeApi({});
    const { router } = renderApp('/checkout');
    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/admin');
      },
      { timeout: 10_000 },
    );
    expect(calls.some((call) => call.path.startsWith('/api/v1/checkout/'))).toBe(false);
  }, 30_000);
});

describe('checkout personalisation', () => {
  it('asks for the message of each product, optional, with the summary beside it', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/cart': json(
        cartOf([line(11, 'Pastel Tres Leches', 1), line(12, 'Cupcakes de Fresa', 6)]),
      ),
    });
    renderApp('/checkout');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Finalizar compra' }),
    ).toBeDefined();
    // El título sale enseguida; el contenido llega con el carrito
    expect(await screen.findByRole('heading', { name: 'Personalización' })).toBeDefined();
    expect(screen.getByLabelText('Mensaje para Pastel Tres Leches')).toBeDefined();
    expect(screen.getByLabelText('Mensaje para Cupcakes de Fresa')).toBeDefined();
    expect(screen.getByText('1 unidad')).toBeDefined();
    expect(screen.getByText('6 unidades')).toBeDefined();
    expect(screen.getAllByText('0 de 60 caracteres')).toHaveLength(2);
    expect(screen.getByRole('complementary')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Volver al carrito' }).getAttribute('href')).toBe(
      '/cart',
    );
  });

  it('saves the message in the cart line keeping its quantity, and confirms it', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    let current = cartOf([line(11, 'Pastel Tres Leches', 2)]);
    const { calls } = installFakeApi({
      'GET /api/v1/cart': () => json(current),
      'PUT /api/v1/cart/items/11': () => {
        current = cartOf([line(11, 'Pastel Tres Leches', 2, { inscription: 'Feliz cumpleaños' })]);
        return json(current);
      },
    });
    renderApp('/checkout');
    const field = await screen.findByLabelText('Mensaje para Pastel Tres Leches');
    const save = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Guardar el mensaje de Pastel Tres Leches',
    });
    // Sin cambios no hay nada que guardar
    expect(save.disabled).toBe(true);

    await user.type(field, 'Feliz cumpleaños');
    expect(screen.getByText('16 de 60 caracteres')).toBeDefined();
    expect(save.disabled).toBe(false);
    await user.click(save);

    expect(await screen.findByText('Guardado')).toBeDefined();
    expect(putsTo(calls, '/api/v1/cart/items/11')[0]?.body).toEqual({
      quantity: 2,
      inscription: 'Feliz cumpleaños',
    });
    expect(save.disabled).toBe(true);
  });

  it('shows the message that the line already had and clears it when the customer empties it', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(
        cartOf([line(11, 'Pastel Tres Leches', 1, { inscription: 'Para Ana' })]),
      ),
      'PUT /api/v1/cart/items/11': json(cartOf([line(11, 'Pastel Tres Leches', 1)])),
    });
    renderApp('/checkout');
    const field = await screen.findByLabelText<HTMLInputElement>('Mensaje para Pastel Tres Leches');
    expect(field.value).toBe('Para Ana');

    await user.clear(field);
    await user.click(
      screen.getByRole('button', { name: 'Guardar el mensaje de Pastel Tres Leches' }),
    );
    await waitFor(() => {
      expect(putsTo(calls, '/api/v1/cart/items/11')).toHaveLength(1);
    });
    expect(putsTo(calls, '/api/v1/cart/items/11')[0]?.body).toEqual({
      quantity: 1,
      inscription: null,
    });
  });

  it('keeps the text and explains the error in Spanish when it cannot be saved', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/cart': json(cartOf([line(11, 'Pastel Tres Leches', 1)])),
      'PUT /api/v1/cart/items/11': apiError(409, 'INSUFFICIENT_STOCK'),
    });
    renderApp('/checkout');
    const field = await screen.findByLabelText<HTMLInputElement>('Mensaje para Pastel Tres Leches');
    await user.type(field, 'Hola');
    await user.click(
      screen.getByRole('button', { name: 'Guardar el mensaje de Pastel Tres Leches' }),
    );
    expect(await screen.findByText('No hay suficientes unidades disponibles.')).toBeDefined();
    expect(field.value).toBe('Hola');
  });

  it('shows the empty state when there is nothing to pay', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/cart': json(cartOf([])) });
    renderApp('/checkout');
    expect(await screen.findByText('Su carrito está vacío')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Personalización' })).toBeNull();
  });
});
