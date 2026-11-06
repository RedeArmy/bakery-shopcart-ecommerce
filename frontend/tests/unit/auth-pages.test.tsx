// cspell:disable
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json, session } from './support/fake-api';
import { category, page, product, renderApp, resetSession, signInAs } from './support/render';

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const catalogueRoutes = {
  'GET /api/v1/categories': json([category(1, 'Pasteles')]),
  'GET /api/v1/products': json(page([product(1, 'Pastel Tres Leches', '145.00', '260.00')])),
};

describe('sign in page', () => {
  it('shows the Spanish field errors and does not call the server when the form is empty', async () => {
    const { calls } = installFakeApi({});
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Escriba su correo electrónico.')).toBeDefined();
    expect(screen.getByText('Escriba su contraseña.')).toBeDefined();
    expect(calls).toEqual([]);
  });

  it('marks the invalid field for assistive technology', async () => {
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    const field = screen.getByLabelText('Correo electrónico');
    await waitFor(() => {
      expect(field.getAttribute('aria-invalid')).toBe('true');
    });
    expect(field.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('El correo no parece válido.')).toBeDefined();
  });

  it('signs in and returns the customer to where they were heading', async () => {
    const { calls } = installFakeApi({
      'POST /api/v1/auth/login': json(session('Ana López')),
      ...catalogueRoutes,
    });
    const { router } = renderApp({ pathname: '/login', state: { from: '/catalogue?q=pastel' } });
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'ana@shopcart.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/catalogue');
    });
    expect(router.state.location.search).toBe('?q=pastel');
    expect(calls.find((call) => call.path === '/api/v1/auth/login')?.body).toEqual({
      email: 'ana@shopcart.test',
      password: 'a long password',
    });
    expect(await screen.findByText('Ana López')).toBeDefined();
  });

  it('says the credentials are wrong without revealing which one', async () => {
    installFakeApi({ 'POST /api/v1/auth/login': apiError(401, 'INVALID_CREDENTIALS') });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'ana@shopcart.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'El correo o la contraseña no son correctos.',
    );
  });

  it('tells a locked account until what time it is blocked', async () => {
    installFakeApi({
      'POST /api/v1/auth/login': apiError(423, 'ACCOUNT_LOCKED', {
        lockedUntil: '2030-01-01T15:30:00Z',
      }),
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'ana@shopcart.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^La cuenta está bloqueada hasta las \d{1,2}:\d{2}/,
    );
  });

  it('says there is no connection when the server cannot be reached', async () => {
    installFakeApi({ 'POST /api/v1/auth/login': () => Promise.reject(new TypeError('Failed')) });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'ana@shopcart.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No hay conexión');
  });

  it('disables the button while the request is in flight so a double click sends it once', async () => {
    let release: (response: Response) => void = () => undefined;
    const { calls } = installFakeApi({
      'POST /api/v1/auth/login': () => new Promise<Response>((resolve) => (release = resolve)),
      ...catalogueRoutes,
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'ana@shopcart.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    const button = screen.getByRole('button', { name: 'Iniciar sesión' });
    await userEvent.dblClick(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Un momento…' })).toBeDefined();
    });
    expect(screen.getByRole('button', { name: 'Un momento…' }).hasAttribute('disabled')).toBe(true);
    expect(calls.filter((call) => call.path === '/api/v1/auth/login')).toHaveLength(1);
    release(json(session()));
  });

  it('sends a customer who is already signed in away from the form', async () => {
    await signInAs('Customer');
    installFakeApi(catalogueRoutes);
    const { router } = renderApp('/login');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});

describe('register page', () => {
  it('validates every field in Spanish before sending anything', async () => {
    const { calls } = installFakeApi({});
    renderApp('/register');
    await userEvent.click(await screen.findByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Escriba su nombre.')).toBeDefined();
    expect(screen.getByText('Escriba su correo electrónico.')).toBeDefined();
    expect(screen.getByText('La contraseña debe tener al menos 10 caracteres.')).toBeDefined();
    expect(calls).toEqual([]);
  });

  it('shows the password hint and marks the phone as optional', async () => {
    renderApp('/register');
    expect(await screen.findByText('Mínimo 10 caracteres.')).toBeDefined();
    expect(screen.getByText('(opcional)')).toBeDefined();
  });

  it('creates the account, signs in and goes home', async () => {
    const { calls } = installFakeApi({
      'POST /api/v1/auth/register': json({ idUser: 9 }, { status: 201 }),
      'POST /api/v1/auth/login': json(session('Bea Díaz')),
      ...catalogueRoutes,
    });
    const { router } = renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Nombre completo'), 'Bea Díaz');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'bea@shopcart.test');
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(calls.find((call) => call.path === '/api/v1/auth/register')?.body).toEqual({
      email: 'bea@shopcart.test',
      password: 'a long password',
      fullName: 'Bea Díaz',
      phone: null,
    });
  });

  it('puts a repeated e-mail on its own field, not in a generic message', async () => {
    installFakeApi({ 'POST /api/v1/auth/register': apiError(409, 'EMAIL_ALREADY_REGISTERED') });
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Nombre completo'), 'Bea');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'bea@shopcart.test');
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    const message = await screen.findByText('Ya existe una cuenta con ese correo.');
    expect(message.id).toBe(`${screen.getByLabelText('Correo electrónico').id}-error`);
  });
});
