// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import type { Call } from './support/fake-api';
import { renderApp, resetSession, signInAs } from './support/render';

// El menú del operador se prueba en el panel (/admin), cuya ruta carga las gráficas con una importación perezosa: la primera vez
// tarda más que la espera de una prueba. Se carga una vez antes de empezar, para que ninguna dependa de ese arranque en frío.
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

// La sesión de las pruebas es la del usuario 1: esa es "su propia cuenta"
const account = (extra = {}) => ({
  idUser: 7,
  email: 'beto@shopcart.test',
  fullName: 'Beto Gómez',
  phone: '5555-1234',
  idRole: 1,
  roleName: 'Customer',
  isActive: true,
  lockedUntil: null,
  createdAt: '2030-01-15T15:00:00Z',
  ...extra,
});

const page = (items: unknown[], total = items.length) => ({ items, page: 1, size: 20, total });

const lastQuery = (calls: Call[]): URLSearchParams =>
  new URLSearchParams(calls.filter((call) => call.path === '/api/v1/admin/users').at(-1)?.search);

describe('the users screen', () => {
  it('lists the accounts with their role, status, contact data and since when', async () => {
    await signInAs('Administrator');
    installFakeApi({
      'GET /api/v1/admin/users': json(
        page([
          account(),
          account({
            idUser: 8,
            fullName: 'Carla Ruiz',
            email: 'carla@shopcart.test',
            phone: null,
            idRole: 2,
            roleName: 'Operator',
            isActive: false,
          }),
        ]),
      ),
    });
    renderApp('/admin/users');

    expect(await screen.findByRole('heading', { level: 1, name: 'Usuarios' })).toBeDefined();
    const items = await screen.findAllByRole('listitem');
    const first = items[0] as HTMLElement;
    expect(within(first).getByText('Beto Gómez')).toBeDefined();
    expect(within(first).getByText('Cliente')).toBeDefined();
    expect(within(first).getByText('Activa')).toBeDefined();
    expect(within(first).getByText('beto@shopcart.test')).toBeDefined();
    expect(within(first).getByText(/5555-1234/)).toBeDefined();
    expect(within(first).getByText(/Desde el/)).toBeDefined();

    const second = items[1] as HTMLElement;
    expect(within(second).getByText('Operador')).toBeDefined();
    expect(within(second).getByText('Desactivada')).toBeDefined();
    expect(screen.getByText('2 cuentas')).toBeDefined();
  });

  it('says that an account is locked while the lock lasts and not after', async () => {
    await signInAs('Administrator');
    installFakeApi({
      'GET /api/v1/admin/users': json(
        page([
          account({ lockedUntil: '2999-01-01T12:00:00Z' }),
          account({ idUser: 8, fullName: 'Carla Ruiz', lockedUntil: '2000-01-01T12:00:00Z' }),
        ]),
      ),
    });
    renderApp('/admin/users');

    await screen.findByText('Carla Ruiz');
    expect(screen.getAllByText(/Bloqueada por intentos fallidos/)).toHaveLength(1);
  });

  it('asks the server for the filters it reads from the address', async () => {
    await signInAs('Administrator');
    const { calls } = installFakeApi({ 'GET /api/v1/admin/users': json(page([account()])) });
    renderApp('/admin/users?q=beto&role=1&active=true');

    await screen.findByText('Beto Gómez');
    const query = lastQuery(calls);
    expect(query.get('search')).toBe('beto');
    expect(query.get('role')).toBe('1');
    expect(query.get('active')).toBe('true');
    expect(query.get('size')).toBe('20');
    expect(screen.getByLabelText<HTMLSelectElement>('Rol').value).toBe('1');
    expect(screen.getByLabelText<HTMLSelectElement>('Estado').value).toBe('true');
  });

  it('does not send the filters that are not set', async () => {
    await signInAs('Administrator');
    const { calls } = installFakeApi({ 'GET /api/v1/admin/users': json(page([account()])) });
    renderApp('/admin/users');

    await screen.findByText('Beto Gómez');
    const query = lastQuery(calls);
    expect(query.has('search')).toBe(false);
    expect(query.has('role')).toBe(false);
    expect(query.has('active')).toBe(false);
  });

  it('filters by role and by status and starts again from the first page', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/admin/users': json(page([account()], 45)) });
    renderApp('/admin/users?page=2');
    await screen.findByText('Beto Gómez');
    expect(lastQuery(calls).get('page')).toBe('2');

    await user.selectOptions(screen.getByLabelText('Rol'), 'Operador');
    await waitFor(() => {
      expect(lastQuery(calls).get('role')).toBe('2');
    });
    expect(lastQuery(calls).get('page')).toBe('1');

    await user.selectOptions(screen.getByLabelText('Estado'), 'Desactivadas');
    await waitFor(() => {
      expect(lastQuery(calls).get('active')).toBe('false');
    });

    await user.selectOptions(screen.getByLabelText('Rol'), 'Todos');
    await waitFor(() => {
      expect(lastQuery(calls).has('role')).toBe(false);
    });
  });

  it('searches by name or email', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/admin/users': json(page([account()])) });
    renderApp('/admin/users');
    await screen.findByText('Beto Gómez');

    await user.type(screen.getByLabelText('Buscar usuario'), 'carla@');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(lastQuery(calls).get('search')).toBe('carla@');
    });
  });

  it('pages on the server', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/admin/users': json(page([account()], 45)) });
    renderApp('/admin/users');
    expect(await screen.findByText('Página 1 de 3')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(lastQuery(calls).get('page')).toBe('2');
    });
    expect(await screen.findByText('Página 2 de 3')).toBeDefined();
  });

  it('says so when nothing matches', async () => {
    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/admin/users': json(page([])) });
    renderApp('/admin/users?q=nadie');

    expect(await screen.findByText('No hay cuentas con esos datos')).toBeDefined();
  });

  it('shows the error of the server and lets it retry', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/admin/users': () => {
        if (failing) return apiError(500, 'INTERNAL_ERROR');
        return json(page([account()]));
      },
    });
    renderApp('/admin/users');

    expect(await screen.findByRole('alert')).toBeDefined();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Beto Gómez')).toBeDefined();
  });
});

describe('deactivating and reactivating an account', () => {
  it('asks before deactivating, then sends the change with an idempotency key and asks again for the list', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let listed = 0;
    const { calls } = installFakeApi({
      'GET /api/v1/admin/users': () => {
        listed += 1;
        return json(page([account({ isActive: listed === 1 })]));
      },
      'PATCH /api/v1/admin/users/7': json({ idUser: 7, isActive: false }),
    });
    renderApp('/admin/users');
    await screen.findByText('Beto Gómez');

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(screen.getByText('¿Desactivar esta cuenta?')).toBeDefined();
    // Todavía no se envió nada
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });
    const sent = calls.find((call) => call.method === 'PATCH');
    expect(sent?.body).toEqual({ isActive: false });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
    // La lista se pidió de nuevo y ahora la cuenta aparece desactivada, con la opción de reactivarla
    expect(await screen.findByText('Desactivada')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeDefined();
  });

  it('keeps the account when the administrator changes their mind', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/admin/users': json(page([account()])) });
    renderApp('/admin/users');
    await screen.findByText('Beto Gómez');

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    await user.click(screen.getByRole('button', { name: 'No, conservarla activa' }));

    expect(screen.queryByText('¿Desactivar esta cuenta?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeDefined();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('reactivates an account with one click', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/users': json(page([account({ isActive: false })])),
      'PATCH /api/v1/admin/users/7': json({ idUser: 7, isActive: true }),
    });
    renderApp('/admin/users');
    await screen.findByText('Beto Gómez');

    await user.click(screen.getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });
    const sent = calls.find((call) => call.method === 'PATCH');
    expect(sent?.body).toEqual({ isActive: true });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('shows the reason when the server does not allow the change', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/users': json(page([account()])),
      'PATCH /api/v1/admin/users/7': apiError(422, 'UNPROCESSABLE'),
    });
    renderApp('/admin/users');
    await screen.findByText('Beto Gómez');

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    // La confirmación sigue abierta para poder conservar la cuenta
    expect(screen.getByRole('button', { name: 'No, conservarla activa' })).toBeDefined();
  });

  it('shows the reason when a reactivation fails', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/users': json(page([account({ isActive: false })])),
      'PATCH /api/v1/admin/users/7': apiError(404, 'NOT_FOUND'),
    });
    renderApp('/admin/users');
    await screen.findByText('Beto Gómez');

    await user.click(screen.getByRole('button', { name: 'Reactivar' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('does not offer to deactivate the own account of the administrator', async () => {
    await signInAs('Administrator');
    installFakeApi({
      'GET /api/v1/admin/users': json(
        page([
          account({ idUser: 1, fullName: 'Ana Admin', roleName: 'Administrator', idRole: 3 }),
          account(),
        ]),
      ),
    });
    renderApp('/admin/users');

    const items = await screen.findAllByRole('listitem');
    const own = items[0] as HTMLElement;
    expect(within(own).getByText(/no se puede desactivar/)).toBeDefined();
    expect(within(own).queryByRole('button')).toBeNull();
    // Las demás cuentas sí
    expect(
      within(items[1] as HTMLElement).getByRole('button', { name: 'Desactivar' }),
    ).toBeDefined();
  });
});

describe('who can open the users screen', () => {
  it.each(['Operator', 'Customer'] as const)('keeps it away from the %s', async (role) => {
    await signInAs(role);
    const { calls } = installFakeApi({ 'GET /api/v1/admin/users': json(page([account()])) });
    renderApp('/admin/users');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path === '/api/v1/admin/users')).toBe(false);
  });

  it('is offered in the menu to the administrator and not to the operator', async () => {
    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/admin/users': json(page([])) });
    const administrator = renderApp('/admin/users');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Usuarios' })).toBeDefined();
    administrator.unmount();
    cleanup();
    await resetSession();

    await signInAs('Operator');
    installFakeApi({});
    renderApp('/admin');
    const operatorHeader = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(operatorHeader).queryByRole('link', { name: 'Usuarios' })).toBeNull();
  });
});
