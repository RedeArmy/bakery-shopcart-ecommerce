// cspell:disable
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { auth } from '../../src/shared/auth';
import { getGuestToken, peekGuestToken } from '../../src/features/cart/model/guest-token';
import { apiError, guestSession, installFakeApi, json, session } from './support/fake-api';
import type { Call } from './support/fake-api';
import { cartOf, emptyCart, line, productDetail } from './support/cart-fixtures';
import { renderApp, resetSession, signInAs, signInAsGuest } from './support/render';

beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const callsTo = (calls: Call[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);
const orderOf = (calls: Call[], method: string, path: string) =>
  calls.findIndex((call) => call.method === method && call.path === path);

const oneLine = cartOf([line(11, 'Pastel Tres Leches', 1)]);

describe('a visitor becomes a guest only when it chooses to', () => {
  it('opens the guest session and hands the cart over when the visitor continues as a guest', async () => {
    const token = getGuestToken();
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(oneLine),
      'POST /api/v1/auth/guest': json(guestSession()),
      'POST /api/v1/cart/merge': json(oneLine),
    });
    renderApp('/checkout');
    await user.click(await screen.findByRole('button', { name: 'Continuar como invitado' }));

    expect(await screen.findByRole('heading', { name: 'Sus datos de contacto' })).toBeDefined();
    // Primero la sesión y después la fusión del carrito con el token del visitante
    expect(orderOf(calls, 'POST', '/api/v1/auth/guest')).toBeLessThan(
      orderOf(calls, 'POST', '/api/v1/cart/merge'),
    );
    expect(callsTo(calls, 'POST', '/api/v1/cart/merge')[0]?.body).toEqual({ guestToken: token });
    expect(peekGuestToken()).toBeNull();
    // No se abre ninguna sesión de invitado antes de que el visitante lo pida
    expect(callsTo(calls, 'POST', '/api/v1/auth/guest')).toHaveLength(1);
  });

  it('does not open a guest session for a coupon: it tells the visitor that coupons need an account', async () => {
    getGuestToken();
    const { calls } = installFakeApi({ 'GET /api/v1/cart': json(oneLine) });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');
    const summary = within(screen.getByRole('complementary'));
    expect(summary.getByText('Los cupones se aplican con una cuenta')).toBeDefined();
    expect(summary.queryByLabelText('Cupón de descuento')).toBeNull();
    expect(summary.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe(
      '/login',
    );
    expect(summary.getByRole('link', { name: 'Crear cuenta' }).getAttribute('href')).toBe(
      '/register',
    );
    expect(callsTo(calls, 'POST', '/api/v1/auth/guest')).toHaveLength(0);
  });

  it('keeps the coupon locked for a guest too, who can still go to the payment', async () => {
    await signInAsGuest('maria@example.test');
    installFakeApi({ 'GET /api/v1/cart': json(oneLine) });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');
    const summary = within(screen.getByRole('complementary'));
    expect(summary.getByText('Los cupones se aplican con una cuenta')).toBeDefined();
    expect(summary.queryByLabelText('Cupón de descuento')).toBeNull();
    expect(summary.getByRole('link', { name: 'Continuar con el pago' }).getAttribute('href')).toBe(
      '/checkout',
    );
  });
});

describe('the contact data of a guest', () => {
  it('asks for it and saves it, with no recovery code to issue any more', async () => {
    await signInAsGuest();
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(oneLine),
      'PUT /api/v1/auth/guest/contact': json({
        ...guestSession().user,
        email: 'maria@example.test',
        fullName: 'María López',
        phone: '55551234',
      }),
    });
    renderApp('/checkout');

    await screen.findByRole('heading', { name: 'Sus datos de contacto' });
    // El pedido se consulta con su número, así que no hay sección de recuperación
    expect(screen.queryByRole('heading', { name: 'Recupere su pedido después' })).toBeNull();

    await user.type(screen.getByLabelText('Nombre completo'), 'María López');
    await user.type(screen.getByLabelText('Correo electrónico'), 'maria@example.test');
    await user.type(screen.getByLabelText(/Teléfono/), '55551234');
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    expect(await screen.findByText('Datos guardados')).toBeDefined();
    expect(callsTo(calls, 'PUT', '/api/v1/auth/guest/contact')[0]?.body).toEqual({
      email: 'maria@example.test',
      fullName: 'María López',
      phone: '55551234',
    });
    expect(auth.getState().user?.email).toBe('maria@example.test');
    expect(screen.queryByRole('heading', { name: 'Recupere su pedido después' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Generar mi código' })).toBeNull();
  });

  it('explains each missing field in Spanish without calling the server', async () => {
    await signInAsGuest();
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/cart': json(oneLine) });
    renderApp('/checkout');
    await screen.findByRole('heading', { name: 'Sus datos de contacto' });
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(await screen.findByText('Escriba su nombre.')).toBeDefined();
    expect(screen.getByText('Escriba su correo electrónico.')).toBeDefined();
    expect(callsTo(calls, 'PUT', '/api/v1/auth/guest/contact')).toHaveLength(0);
  });

  it('tells the shopper to sign in when the email belongs to a registered account', async () => {
    await signInAsGuest();
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/cart': json(oneLine),
      'PUT /api/v1/auth/guest/contact': apiError(409, 'EMAIL_BELONGS_TO_ACCOUNT'),
    });
    renderApp('/checkout');
    await screen.findByRole('heading', { name: 'Sus datos de contacto' });
    await user.type(screen.getByLabelText('Nombre completo'), 'Ana');
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@shopcart.test');
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(
      await screen.findByText('Ese correo ya tiene una cuenta. Inicie sesión para continuar.'),
    ).toBeDefined();
  });

  it('keeps the personalisation locked for a guest, with the way to unlock it', async () => {
    await signInAsGuest('maria@example.test');
    installFakeApi({ 'GET /api/v1/cart': json(oneLine) });
    renderApp('/checkout');
    const toggle = await screen.findByRole('button', {
      name: 'La personalización necesita una cuenta',
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText(/Mensaje para/)).toBeNull();
    await userEvent.setup().click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const main = within(screen.getByRole('main'));
    expect(main.getAllByRole('link', { name: 'Crear cuenta' }).length).toBeGreaterThan(0);
  });
});

describe('made to order products need an account', () => {
  it('shows a visitor why it cannot add them, instead of the add button', async () => {
    installFakeApi({ 'GET /api/v1/products/7': json(productDetail(2)) });
    renderApp('/catalogue/7');
    expect(await screen.findByText('Este producto se prepara por encargo')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Agregar al carrito' })).toBeNull();
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe('/login');
  });

  it('does the same for a guest account', async () => {
    await signInAsGuest('maria@example.test');
    installFakeApi({
      'GET /api/v1/products/7': json(productDetail(2)),
      'GET /api/v1/cart': json(emptyCart),
    });
    renderApp('/catalogue/7');
    expect(await screen.findByText('Este producto se prepara por encargo')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Agregar al carrito' })).toBeNull();
  });

  it('lets a registered account add them', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/products/7': json(productDetail(2)),
      'GET /api/v1/cart': json(emptyCart),
    });
    renderApp('/catalogue/7');
    expect(await screen.findByRole('button', { name: 'Agregar al carrito' })).toBeDefined();
    expect(screen.queryByText('Este producto se prepara por encargo')).toBeNull();
  });

  it('lets a visitor add a same day product', async () => {
    installFakeApi({ 'GET /api/v1/products/7': json(productDetail(0)) });
    renderApp('/catalogue/7');
    expect(await screen.findByRole('button', { name: 'Agregar al carrito' })).toBeDefined();
  });

  it('shows the message of the server in Spanish if it refuses anyway', async () => {
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/products/7': json(productDetail(0)),
      'PUT /api/v1/cart/items/11': apiError(422, 'ACCOUNT_REQUIRED'),
    });
    renderApp('/catalogue/7');
    await user.click(await screen.findByRole('button', { name: 'Agregar al carrito' }));
    expect(
      await screen.findByText(
        /Los cupones, los productos por encargo y la personalización se piden con una cuenta/,
      ),
    ).toBeDefined();
  });
});

describe('signing in from a guest session', () => {
  it('does not bounce a guest away from the sign in page', async () => {
    await signInAsGuest();
    installFakeApi({ 'GET /api/v1/cart': json(emptyCart) });
    renderApp('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeDefined();
  });

  it('passes the products of the guest to the account when it signs in, without personalisation or coupon', async () => {
    await signInAsGuest();
    const two = cartOf([line(11, 'Pastel Tres Leches', 2), line(12, 'Cupcakes de Fresa', 6)]);
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(two),
      'POST /api/v1/auth/login': json(session('Ana', 'Customer')),
      'PUT /api/v1/cart/items/11': json(emptyCart),
      'PUT /api/v1/cart/items/12': json(emptyCart),
    });
    renderApp('/cart');
    await screen.findByText('Pastel Tres Leches');

    await act(async () => {
      await auth.login('ana@shopcart.test', 'a long password');
    });

    await waitFor(() => {
      expect(callsTo(calls, 'PUT', '/api/v1/cart/items/12')).toHaveLength(1);
    });
    expect(callsTo(calls, 'PUT', '/api/v1/cart/items/11')[0]?.body).toEqual({
      quantity: 2,
      inscription: null,
    });
    expect(callsTo(calls, 'PUT', '/api/v1/cart/items/12')[0]?.body).toEqual({
      quantity: 6,
      inscription: null,
    });
    // Con el token de la cuenta nueva, no con el del invitado
    expect(callsTo(calls, 'PUT', '/api/v1/cart/items/11')[0]?.headers.get('Authorization')).toBe(
      'Bearer token-1',
    );
  });
});

describe('recovering the orders of a guest', () => {
  it('gives the session back with the email and the code', async () => {
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'POST /api/v1/auth/guest/recover': json(guestSession(9, 'maria@example.test')),
      'GET /api/v1/cart': json(emptyCart),
    });
    renderApp('/recover');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'maria@example.test');
    await user.type(screen.getByLabelText('Código de recuperación'), 'abcde-12345');
    await user.click(screen.getByRole('button', { name: 'Recuperar' }));

    await waitFor(() => {
      expect(auth.getState().user?.email).toBe('maria@example.test');
    });
    expect(callsTo(calls, 'POST', '/api/v1/auth/guest/recover')[0]?.body).toEqual({
      email: 'maria@example.test',
      code: 'abcde-12345',
    });
    expect(auth.getState().user?.isGuest).toBe(true);
  });

  it('answers the same message whether the email or the code is wrong', async () => {
    const user = userEvent.setup();
    installFakeApi({ 'POST /api/v1/auth/guest/recover': apiError(401, 'RECOVERY_INVALID') });
    renderApp('/recover');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'nobody@example.test');
    await user.type(screen.getByLabelText('Código de recuperación'), 'AAAAAAAAAA');
    await user.click(screen.getByRole('button', { name: 'Recuperar' }));
    expect(await screen.findByText('El correo o el código no son correctos.')).toBeDefined();
  });

  it('asks for both fields before calling the server', async () => {
    const user = userEvent.setup();
    const { calls } = installFakeApi({});
    renderApp('/recover');
    await user.click(await screen.findByRole('button', { name: 'Recuperar' }));
    expect(await screen.findByText('Escriba su correo electrónico.')).toBeDefined();
    expect(screen.getByText('Escriba el código que guardó.')).toBeDefined();
    expect(callsTo(calls, 'POST', '/api/v1/auth/guest/recover')).toHaveLength(0);
  });

  it('is reachable from the sign in page', async () => {
    installFakeApi({});
    renderApp('/login');
    const link = await screen.findByRole('link', {
      name: '¿Compró como invitado? Recupere su pedido',
    });
    expect(link.getAttribute('href')).toBe('/recover');
  });
});

describe('the contact data at the checkout', () => {
  it('is not asked from a customer with an account, whose data comes from the account', async () => {
    await signInAs('Customer');
    installFakeApi({ 'GET /api/v1/cart': json(oneLine) });
    renderApp('/checkout');

    // Con cuenta se sigue directo a cómo recibir el pedido, sin formulario de contacto
    expect(await screen.findByRole('heading', { name: 'Cómo recibe su pedido' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Sus datos de contacto' })).toBeNull();
    expect(screen.queryByLabelText('Nombre completo')).toBeNull();
  });

  it('says that the name and the email are required for a guest, and that the phone is optional', async () => {
    await signInAsGuest();
    installFakeApi({ 'GET /api/v1/cart': json(oneLine) });
    renderApp('/checkout');

    await screen.findByRole('heading', { name: 'Sus datos de contacto' });
    expect(
      screen.getByText(/El nombre y el correo son obligatorios; el teléfono es opcional\./),
    ).toBeDefined();
    // Sin ellos no hay forma de recibir el pedido: los pasos siguientes no aparecen
    expect(screen.queryByRole('heading', { name: 'Cómo recibe su pedido' })).toBeNull();
  });
});
