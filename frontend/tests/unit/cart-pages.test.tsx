// cspell:disable
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { auth } from '../../src/shared/auth';
import { getGuestToken, peekGuestToken } from '../../src/features/cart/model/guest-token';
import { apiError, installFakeApi, json, session } from './support/fake-api';
import type { Call } from './support/fake-api';
import { renderApp, resetSession, signInAs } from './support/render';

// La sesión arranca como "desconocida" hasta que alguien la recupera: sin esto la primera prueba esperaría para siempre
beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const money = (amount: number) => amount.toFixed(2);

const line = (idVariant: number, name: string, quantity: number, price: number, extra = {}) => ({
  idCartItem: idVariant * 10,
  idVariant,
  sku: `SKU-${idVariant}`,
  productName: name,
  quantity,
  inscription: null,
  unitPrice: money(price),
  lineTotal: money(price * quantity),
  available: 20,
  isAvailable: true,
  ...extra,
});

// Los importes de estas pruebas son datos fijos: el cliente nunca los calcula, solo los muestra
const cartOf = (lines: ReturnType<typeof line>[], extra = {}) => ({
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
  ...extra,
});

const emptyCart = cartOf([], { idCart: null, subtotal: '0.00', total: '0.00', vat: '0.00' });

const detailOf = (leadTimeDays: number) =>
  json({
    idProduct: 7,
    idCategory: 1,
    categoryName: 'Pasteles',
    name: 'Pastel Tres Leches',
    description: null,
    leadTimeDays,
    isActive: true,
    images: [],
    variants: [
      {
        idVariant: 11,
        sku: 'PAS-3L-06',
        price: '145.00',
        onHandStock: 12,
        available: 12,
        isActive: true,
        attributes: [{ name: 'Tamaño', value: '6 porciones' }],
      },
      {
        idVariant: 13,
        sku: 'PAS-3L-24',
        price: '480.00',
        onHandStock: 0,
        available: 0,
        isActive: true,
        attributes: [{ name: 'Tamaño', value: '24 porciones' }],
      },
    ],
  });

// Del mismo día: un visitante puede pedirlo
const detail = detailOf(0);
const callsTo = (calls: Call[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

describe('cart page as a visitor', () => {
  it('shows the empty state without asking the server when there is no cart yet', async () => {
    const { calls } = installFakeApi({});
    renderApp('/cart');
    expect(await screen.findByText('Su carrito está vacío')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ver el catálogo' }).getAttribute('href')).toBe(
      '/catalogue',
    );
    expect(callsTo(calls, 'GET', '/api/v1/cart')).toHaveLength(0);
  });

  it('lists the lines with the totals of the server and lets a visitor use a coupon and go to the payment', async () => {
    getGuestToken();
    installFakeApi({
      'GET /api/v1/cart': json(
        cartOf([line(11, 'Pastel Tres Leches', 2, 145, { inscription: 'Feliz cumpleaños' })]),
      ),
    });
    renderApp('/cart');

    expect(await screen.findByText('Pastel Tres Leches')).toBeDefined();
    expect(screen.getByText('Inscripción: Feliz cumpleaños')).toBeDefined();
    expect(screen.getByText('2 productos')).toBeDefined();
    const summary = screen.getByRole('complementary');
    // El subtotal y el total coinciden: no hay descuento
    expect(within(summary).getAllByText('Q290.00')).toHaveLength(2);
    expect(within(summary).getByText('Incluye IVA Q31.07')).toBeDefined();
    // Sin descuento no se muestra la línea
    expect(within(summary).queryByText('Descuento')).toBeNull();

    // Un visitante usa cupones y paga sin cuenta: la sesión de invitado se abre cuando hace falta
    expect(within(summary).getByLabelText('Cupón de descuento')).toBeDefined();
    const pay = within(summary).getByRole('link', { name: 'Continuar con el pago' });
    expect(pay.getAttribute('href')).toBe('/checkout');
  });

  it('sends the visitor token and changes a quantity keeping the inscription', async () => {
    const token = getGuestToken();
    const user = userEvent.setup();
    let current = cartOf([line(11, 'Pastel Tres Leches', 1, 145, { inscription: 'Para Ana' })]);
    const { calls } = installFakeApi({
      'GET /api/v1/cart': () => json(current),
      'PUT /api/v1/cart/items/11': () => {
        current = cartOf([line(11, 'Pastel Tres Leches', 2, 145, { inscription: 'Para Ana' })]);
        return json(current);
      },
    });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');
    expect(callsTo(calls, 'GET', '/api/v1/cart')[0]?.headers.get('X-Cart-Token')).toBe(token);

    await user.click(screen.getByRole('button', { name: 'Una unidad más' }));
    await waitFor(() => {
      expect(callsTo(calls, 'PUT', '/api/v1/cart/items/11')).toHaveLength(1);
    });
    const put = callsTo(calls, 'PUT', '/api/v1/cart/items/11')[0];
    expect(put?.body).toEqual({ quantity: 2, inscription: 'Para Ana' });
    expect(put?.headers.get('X-Cart-Token')).toBe(token);
    expect(await screen.findByText('2 productos')).toBeDefined();
  });

  it('removes a line and shows the empty state', async () => {
    getGuestToken();
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(cartOf([line(11, 'Pastel Tres Leches', 1, 145)])),
      'DELETE /api/v1/cart/items/11': json(emptyCart),
    });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');
    await user.click(screen.getByRole('button', { name: 'Quitar Pastel Tres Leches del carrito' }));
    expect(await screen.findByText('Su carrito está vacío')).toBeDefined();
    expect(callsTo(calls, 'DELETE', '/api/v1/cart/items/11')).toHaveLength(1);
  });

  it('shows the error in Spanish when the stock is not enough and keeps the line', async () => {
    getGuestToken();
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/cart': json(cartOf([line(11, 'Pastel Tres Leches', 1, 145)])),
      'PUT /api/v1/cart/items/11': apiError(409, 'INSUFFICIENT_STOCK'),
    });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');
    await user.click(screen.getByRole('button', { name: 'Una unidad más' }));
    expect(await screen.findByText('No hay suficientes unidades disponibles.')).toBeDefined();
    expect(screen.getByText('Pastel Tres Leches')).toBeDefined();
  });

  it('shows an error state with a retry when the cart cannot be loaded', async () => {
    getGuestToken();
    let fail = true;
    installFakeApi({
      'GET /api/v1/cart': () =>
        fail ? apiError(500, 'UNEXPECTED') : json(cartOf([line(11, 'Pastel Tres Leches', 1, 145)])),
    });
    renderApp('/cart');
    expect(await screen.findByText('No pudimos cargar esto')).toBeDefined();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Pastel Tres Leches')).toBeDefined();
  });
});

describe('cart page with an account', () => {
  const signedCart = (extra = {}) => cartOf([line(11, 'Pastel Tres Leches', 2, 145)], extra);

  it('applies a coupon and shows the discount that the server calculated', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const discounted = signedCart({ couponCode: 'WELCOME10', discount: '29.00', total: '261.00' });
    let applied = false;
    const { calls } = installFakeApi({
      'GET /api/v1/cart': () => json(applied ? discounted : signedCart()),
      'POST /api/v1/cart/coupon': () => {
        applied = true;
        return json(discounted);
      },
    });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');

    await user.type(screen.getByLabelText('Cupón de descuento'), 'WELCOME10');
    await user.click(screen.getByRole('button', { name: 'Aplicar cupón' }));

    expect(await screen.findByText('WELCOME10')).toBeDefined();
    expect(screen.getByText('−Q29.00')).toBeDefined();
    expect(screen.getByText('Q261.00', { selector: 'dd span' })).toBeDefined();
    const post = callsTo(calls, 'POST', '/api/v1/cart/coupon')[0];
    expect(post?.body).toEqual({ code: 'WELCOME10' });
    // El cupón se aplica con una clave de idempotencia para que un reenvío no lo repita
    expect(post?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    // Quien tiene sesión no manda el token de visitante
    expect(callsTo(calls, 'GET', '/api/v1/cart')[0]?.headers.get('X-Cart-Token')).toBeNull();
  });

  it('explains in Spanish why a coupon is refused', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/cart': json(signedCart()),
      'POST /api/v1/cart/coupon': apiError(409, 'COUPON_EXPIRED'),
    });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');
    await user.type(screen.getByLabelText('Cupón de descuento'), 'OLD');
    await user.click(screen.getByRole('button', { name: 'Aplicar cupón' }));
    expect(await screen.findByText('Este cupón ya venció.')).toBeDefined();
  });

  it('says why an applied coupon stopped discounting and lets the customer remove it', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(signedCart({ couponCode: 'SOLDOUT', couponReason: 'Exhausted' })),
      'DELETE /api/v1/cart/coupon': json(signedCart()),
    });
    renderApp('/cart');
    expect(
      await screen.findByText('Este cupón ya alcanzó su límite de usos y no descuenta.'),
    ).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Quitar cupón' }));
    expect(await screen.findByLabelText('Cupón de descuento')).toBeDefined();
    expect(callsTo(calls, 'DELETE', '/api/v1/cart/coupon')).toHaveLength(1);
  });

  it('leads to the payment, and blocks it while a line is sold out', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/cart': json(signedCart()) });
    const { unmount } = renderApp('/cart');
    const pay = await screen.findByRole('link', { name: 'Continuar con el pago' });
    expect(pay.getAttribute('href')).toBe('/checkout');
    unmount();
    cleanup();

    installFakeApi({
      'GET /api/v1/cart': json(
        cartOf([line(11, 'Pastel Tres Leches', 3, 145, { available: 1, isAvailable: true })], {
          hasUnavailableLines: true,
        }),
      ),
    });
    renderApp('/cart');
    expect(await screen.findByText('Solo queda 1 unidad')).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Continuar con el pago' }).disabled,
    ).toBe(true);
    expect(
      screen.getByText('Quite o ajuste los productos que ya no alcanzan para continuar.'),
    ).toBeDefined();
  });
});

describe('adding from the product page', () => {
  it('adds as a visitor with the token and the quantity, without asking for a personalisation', async () => {
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/products/7': detail,
      'PUT /api/v1/cart/items/11': json(cartOf([line(11, 'Pastel Tres Leches', 2, 145)])),
    });
    renderApp('/catalogue/7');
    await screen.findByRole('heading', { level: 1, name: 'Pastel Tres Leches' });

    // La personalización se escribe al pagar, no en la ficha del producto
    expect(screen.queryByLabelText(/Inscripción|Mensaje/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Una unidad más' }));
    await user.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    expect(await screen.findByText('Agregado al carrito.')).toBeDefined();
    const put = callsTo(calls, 'PUT', '/api/v1/cart/items/11')[0];
    expect(put?.body).toEqual({ quantity: 2, inscription: null });
    expect(put?.headers.get('X-Cart-Token')).toBe(peekGuestToken());
    expect(peekGuestToken()).not.toBeNull();
    // El encabezado ya muestra cuántos productos lleva
    expect(screen.getByRole('link', { name: 'Carrito, 2 productos' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ver carrito' }).getAttribute('href')).toBe('/cart');
  });

  it('adds on top of what the cart already has', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/products/7': detail,
      'GET /api/v1/cart': json(cartOf([line(11, 'Pastel Tres Leches', 2, 145)])),
      'PUT /api/v1/cart/items/11': json(cartOf([line(11, 'Pastel Tres Leches', 3, 145)])),
    });
    renderApp('/catalogue/7');
    expect(await screen.findByText('Ya tiene 2 unidades en su carrito.')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Agregar al carrito' }));
    await screen.findByText('Agregado al carrito.');
    expect(callsTo(calls, 'PUT', '/api/v1/cart/items/11')[0]?.body).toEqual({
      quantity: 3,
      inscription: null,
    });
  });

  it('keeps the personalisation of the line when it adds more units', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/products/7': detail,
      'GET /api/v1/cart': json(
        cartOf([line(11, 'Pastel Tres Leches', 1, 145, { inscription: 'Para Ana' })]),
      ),
      'PUT /api/v1/cart/items/11': json(cartOf([line(11, 'Pastel Tres Leches', 2, 145)])),
    });
    renderApp('/catalogue/7');
    await screen.findByText('Ya tiene 1 unidad en su carrito.');
    await user.click(screen.getByRole('button', { name: 'Agregar al carrito' }));
    await screen.findByText('Agregado al carrito.');
    expect(callsTo(calls, 'PUT', '/api/v1/cart/items/11')[0]?.body).toEqual({
      quantity: 2,
      inscription: 'Para Ana',
    });
  });

  it('disables adding a variant that is sold out', async () => {
    const user = userEvent.setup();
    installFakeApi({ 'GET /api/v1/products/7': detail });
    renderApp('/catalogue/7');
    await screen.findByRole('heading', { level: 1, name: 'Pastel Tres Leches' });
    await user.click(screen.getByLabelText('24 porciones'));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Agregar al carrito' }).disabled,
    ).toBe(true);
  });

  it('shows the error in Spanish when the server refuses the quantity', async () => {
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/products/7': detail,
      'PUT /api/v1/cart/items/11': apiError(409, 'INSUFFICIENT_STOCK'),
    });
    renderApp('/catalogue/7');
    await screen.findByRole('heading', { level: 1, name: 'Pastel Tres Leches' });
    await user.click(screen.getByRole('button', { name: 'Agregar al carrito' }));
    expect(await screen.findByText('No hay suficientes unidades disponibles.')).toBeDefined();
  });
});

describe('cart and session', () => {
  it('hands the visitor cart to the account when the customer signs in, and forgets the token', async () => {
    const token = getGuestToken();
    const merged = cartOf([line(11, 'Pastel Tres Leches', 2, 145)]);
    let done = false;
    const { calls } = installFakeApi({
      'GET /api/v1/cart': () => json(done ? merged : emptyCart),
      'POST /api/v1/auth/login': json(session('Ana', 'Customer')),
      'POST /api/v1/cart/merge': () => {
        done = true;
        return json(merged);
      },
    });
    renderApp('/cart');
    await screen.findByText('Su carrito está vacío');

    await act(async () => {
      await auth.login('ana@shopcart.test', 'a long password');
    });

    await waitFor(() => {
      expect(callsTo(calls, 'POST', '/api/v1/cart/merge')).toHaveLength(1);
    });
    expect(callsTo(calls, 'POST', '/api/v1/cart/merge')[0]?.body).toEqual({ guestToken: token });
    expect(await screen.findByText('Pastel Tres Leches')).toBeDefined();
    expect(peekGuestToken()).toBeNull();
  });

  it('keeps the token when the merge fails, so it can be tried again at the next sign in', async () => {
    const token = getGuestToken();
    installFakeApi({
      'GET /api/v1/cart': json(emptyCart),
      'POST /api/v1/auth/login': json(session('Ana', 'Customer')),
      'POST /api/v1/cart/merge': apiError(500, 'UNEXPECTED'),
    });
    renderApp('/cart');
    await screen.findByText('Su carrito está vacío');
    await act(async () => {
      await auth.login('ana@shopcart.test', 'a long password');
    });
    await waitFor(() => {
      expect(screen.queryByText('Su carrito está vacío')).not.toBeNull();
    });
    expect(peekGuestToken()).toBe(token);
  });

  it('does not show the cart of the account to the next visitor after signing out', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/cart': json(cartOf([line(11, 'Pastel Tres Leches', 1, 145)])),
      'POST /api/v1/auth/logout': new Response(null, { status: 204 }),
    });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');

    await act(async () => {
      await auth.logout();
    });
    expect(await screen.findByText('Su carrito está vacío')).toBeDefined();
  });
});
