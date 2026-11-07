// cspell:disable
import { cleanup, screen, waitFor } from '@testing-library/react';
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

const branch = (extra = {}) => ({
  idBranch: 5,
  name: 'Centro',
  line1: '6a avenida 10-20',
  municipality: 'Guatemala',
  department: 'Guatemala',
  phone: '22221111',
  openingHours: 'Lunes a sábado de 8:00 a 18:00',
  isActive: true,
  openOrders: 2,
  ...extra,
});

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(await screen.findByLabelText('Nombre de la sucursal'), 'Norte');
  await user.type(screen.getByLabelText('Municipio'), 'Mixco');
  await user.type(screen.getByLabelText('Departamento'), 'Guatemala');
  await user.type(screen.getByLabelText('Dirección'), 'Calzada Roosevelt 5-10');
};

describe('the branches administration', () => {
  it('lists the active and the deactivated branches, with actions only for the active ones', async () => {
    await signInAs('Administrator');
    installFakeApi({
      'GET /api/v1/admin/branches': json([
        branch(),
        branch({ idBranch: 6, name: 'Cerrada', isActive: false, openOrders: 0 }),
      ]),
    });
    renderApp('/admin/branches');

    expect(await screen.findByRole('heading', { name: 'Sucursales' })).toBeDefined();
    expect(await screen.findByText('Centro')).toBeDefined();
    expect(screen.getByText('Activa')).toBeDefined();
    expect(screen.getByText('Desactivada')).toBeDefined();
    expect(screen.getByText('2 pedidos esperando')).toBeDefined();
    // Solo la activa se edita o se quita
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Quitar' })).toHaveLength(1);
  });

  it('explains an empty list and opens the form to add the first branch', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({ 'GET /api/v1/admin/branches': json([]) });
    renderApp('/admin/branches');

    expect(await screen.findByText('Todavía no hay sucursales')).toBeDefined();
    await user.click(screen.getAllByRole('button', { name: 'Agregar sucursal' })[0] as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Nueva sucursal' })).toBeDefined();
  });

  it('asks for the required data before creating a branch', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/admin/branches': json([branch()]) });
    renderApp('/admin/branches');

    await user.click(await screen.findByRole('button', { name: 'Agregar sucursal' }));
    await user.click(await screen.findByRole('button', { name: 'Crear sucursal' }));

    expect((await screen.findAllByText('Este dato es obligatorio.')).length).toBeGreaterThan(0);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('creates a branch with an idempotency key, nulls for the optional data, and shows it in the list', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let created = false;
    const { calls } = installFakeApi({
      'GET /api/v1/admin/branches': () =>
        json(created ? [branch(), branch({ idBranch: 7, name: 'Norte' })] : [branch()]),
      'POST /api/v1/admin/branches': () => {
        created = true;
        return json({ idBranch: 7 }, { status: 201 });
      },
    });
    renderApp('/admin/branches');

    await user.click(await screen.findByRole('button', { name: 'Agregar sucursal' }));
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    expect(await screen.findByText('Norte')).toBeDefined();
    const sent = calls.find((call) => call.method === 'POST');
    expect(sent?.body).toEqual({
      name: 'Norte',
      line1: 'Calzada Roosevelt 5-10',
      municipality: 'Mixco',
      department: 'Guatemala',
      phone: null,
      openingHours: null,
    });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('shows the answer of the server when the name is already in use', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/branches': json([branch()]),
      'POST /api/v1/admin/branches': apiError(409, 'BRANCH_NAME_IN_USE'),
    });
    renderApp('/admin/branches');

    await user.click(await screen.findByRole('button', { name: 'Agregar sucursal' }));
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    expect(await screen.findByText('Ya hay una sucursal activa con ese nombre.')).toBeDefined();
  });

  it('edits a branch with its data already in the form', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/branches': json([branch()]),
      'PUT /api/v1/admin/branches/5': json({ idBranch: 5 }),
    });
    renderApp('/admin/branches');

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const name = await screen.findByLabelText<HTMLInputElement>('Nombre de la sucursal');
    expect(name.value).toBe('Centro');
    await user.clear(name);
    await user.type(name, 'Centro histórico');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PUT')).toBe(true);
    });
    const sent = calls.find((call) => call.method === 'PUT');
    expect(sent?.body).toMatchObject({ name: 'Centro histórico', phone: '22221111' });
  });

  it('removes a branch only after a confirmation, and shows why it cannot when orders are waiting', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/branches': json([branch()]),
      'DELETE /api/v1/admin/branches/5': apiError(422, 'BRANCH_HAS_OPEN_ORDERS'),
    });
    renderApp('/admin/branches');

    await user.click(await screen.findByRole('button', { name: 'Quitar' }));
    // Nada se envía hasta confirmar
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Sí, quitarla' }));
    expect(await screen.findByText(/La sucursal todavía tiene pedidos esperando/)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'No, conservarla' }));
    expect(screen.queryByRole('button', { name: 'Sí, quitarla' })).toBeNull();
  });

  it('deactivates the branch when the server accepts it and the list refreshes', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let removed = false;
    installFakeApi({
      'GET /api/v1/admin/branches': () => json([branch({ isActive: !removed, openOrders: 0 })]),
      'DELETE /api/v1/admin/branches/5': () => {
        removed = true;
        return json({ idBranch: 5, isActive: false });
      },
    });
    renderApp('/admin/branches');

    await user.click(await screen.findByRole('button', { name: 'Quitar' }));
    await user.click(screen.getByRole('button', { name: 'Sí, quitarla' }));

    expect(await screen.findByText('Desactivada')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();
    // La confirmación se cierra al lograrse
    expect(screen.queryByRole('button', { name: 'Sí, quitarla' })).toBeNull();
  });

  it('shows the error of the list and lets the administrator retry', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/admin/branches': () =>
        failing ? apiError(500, 'INTERNAL_ERROR') : json([branch()]),
    });
    renderApp('/admin/branches');

    expect(await screen.findByRole('alert')).toBeDefined();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Centro')).toBeDefined();
  });

  it('is not for a customer, and the menu shows the entry to the administrator only', async () => {
    await signInAs('Customer');
    installFakeApi({});
    renderApp('/admin/branches');
    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Sucursales' })).toBeNull();
    cleanup();
    await resetSession();

    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/admin/branches': json([]) });
    renderApp('/admin/branches');
    expect((await screen.findAllByRole('link', { name: 'Sucursales' })).length).toBeGreaterThan(0);
  });
});
