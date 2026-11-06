// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../../src/app/protected-route';
import '../../src/shared/i18n';
import { auth } from '../../src/shared/auth';
import { installFakeApi, json, session } from './support/fake-api';
import { category, page, renderApp, renderRoutes, resetSession, signInAs } from './support/render';

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const home = {
  'GET /api/v1/categories': json([category(1, 'Pasteles')]),
  'GET /api/v1/products': json(page([])),
};

describe('header and menu', () => {
  it('offers to sign in or register to a visitor and shows only public links', async () => {
    installFakeApi(home);
    renderApp('/');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Iniciar sesión' })).toBeDefined();
    expect(within(header).getByRole('link', { name: 'Crear cuenta' })).toBeDefined();
    expect(within(header).getAllByRole('link', { name: 'Catálogo' }).length).toBeGreaterThan(0);
    expect(within(header).queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('shows the name of a signed-in customer and lets them sign out', async () => {
    await signInAs('Customer', 'Ana López');
    const { calls } = installFakeApi({
      ...home,
      'POST /api/v1/auth/logout': new Response(null, { status: 204 }),
    });
    const { router } = renderApp('/catalogue');
    expect(await screen.findByText('Ana López')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => {
      expect(screen.queryByText('Ana López')).toBeNull();
    });
    expect(calls.some((call) => call.path === '/api/v1/auth/logout')).toBe(true);
    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findAllByRole('link', { name: 'Iniciar sesión' })).toBeDefined();
  });

  it('opens and closes the phone menu, announcing its state', async () => {
    installFakeApi(home);
    renderApp('/');
    const toggle = await screen.findByRole('button', { name: 'Menú' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the phone menu when the customer goes to another page', async () => {
    installFakeApi(home);
    renderApp('/');
    const toggle = await screen.findByRole('button', { name: 'Menú' });
    await userEvent.click(toggle);
    const menu = document.getElementById('mobile-menu') as HTMLElement;
    await userEvent.click(within(menu).getByRole('link', { name: 'Catálogo' }));
    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('has a skip link and a main landmark', async () => {
    installFakeApi(home);
    renderApp('/');
    expect((await screen.findByText('Saltar al contenido')).getAttribute('href')).toBe('#content');
    expect(screen.getByRole('main').id).toBe('content');
  });
});

describe('session restore on start', () => {
  it('recovers the session with the cookie when this browser had one', async () => {
    localStorage.setItem('shopcart.session', '1');
    // El almacén de la sesión única ya salió de "desconocido" en otras pruebas: se verifica con una sesión nueva
    const { createAuth } = await import('../../src/shared/auth/session');
    const fresh = createAuth({ baseUrl: 'http://localhost' });
    installFakeApi({ 'POST /api/v1/auth/refresh': json(session('Ana López')) });
    await fresh.restore();
    expect(fresh.getState().user?.fullName).toBe('Ana López');
  });
});

describe('ProtectedRoute', () => {
  const tree = (roles?: ('Customer' | 'Operator' | 'Administrator')[]) => [
    { path: '/login', element: <p>pantalla de ingreso</p> },
    {
      element: <ProtectedRoute {...(roles === undefined ? {} : { roles })} />,
      children: [{ path: '/secret', element: <p>contenido protegido</p> }],
    },
  ];

  it('sends a visitor to sign in', async () => {
    const { router } = renderRoutes(tree(['Administrator']), '/secret?tab=1');
    expect(await screen.findByText('pantalla de ingreso')).toBeDefined();
    expect(router.state.location.state).toEqual({ from: '/secret?tab=1' });
  });

  it('shows the forbidden page to a signed-in role that is not allowed', async () => {
    await signInAs('Customer');
    renderRoutes(tree(['Administrator']), '/secret');
    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(screen.queryByText('contenido protegido')).toBeNull();
  });

  it('shows the content to an allowed role', async () => {
    await signInAs('Administrator');
    renderRoutes(tree(['Administrator']), '/secret');
    expect(await screen.findByText('contenido protegido')).toBeDefined();
  });

  it('shows the content of a route with no roles to any signed-in customer', async () => {
    await signInAs('Customer');
    renderRoutes(tree(), '/secret');
    expect(await screen.findByText('contenido protegido')).toBeDefined();
  });

  it('keeps the session store reachable for the other tests', () => {
    expect(auth.getState().status).toBe('anonymous');
  });
});
