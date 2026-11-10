// cspell:disable
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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

const entry = (extra = {}) => ({
  idAuditLog: '41',
  module: 'Users',
  entityName: 'User',
  entityKey: '7',
  action: 'StatusChange',
  previousValue: '{"IsActive":true}',
  newValue: '{"IsActive":false}',
  idUser: 1,
  userName: 'Ana Pérez',
  createdAt: '2030-06-01T15:00:00Z',
  ...extra,
});

const page = (items: unknown[], total = items.length) => ({ items, page: 1, size: 15, total });

const lastQuery = (calls: Call[]): URLSearchParams =>
  new URLSearchParams(
    calls.filter((call) => call.path === '/api/v1/admin/audit-log').at(-1)?.search,
  );

describe('the audit log', () => {
  it('lists the records with what was done, on what, by whom, when and what changed', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/audit-log': json(
        page([
          entry(),
          entry({
            idAuditLog: '40',
            module: 'Coupons',
            entityName: 'Coupon',
            entityKey: '3',
            action: 'Create',
            previousValue: null,
            newValue: '{"Code":"VERANO","Percent":"10"}',
            userName: null,
          }),
        ]),
      ),
    });
    renderApp('/admin/audit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Bitácora' })).toBeDefined();
    const items = await screen.findAllByRole('listitem');
    const first = items[0] as HTMLElement;
    expect(within(first).getByText('Cambio de estado')).toBeDefined();
    expect(within(first).getByText('Usuarios')).toBeDefined();
    expect(within(first).getByText('Usuario n.º 7')).toBeDefined();
    expect(within(first).getByText(/Por Ana Pérez/)).toBeDefined();
    // Cerrado muestra solo el resumen; los detalles salen al pulsar el registro
    expect(within(first).queryByText('Activo')).toBeNull();
    await user.click(within(first).getByRole('button'));
    // Campo por campo: el nombre, el valor anterior y el nuevo
    expect(within(first).getByText('Activo')).toBeDefined();
    expect(within(first).getByText('Sí')).toBeDefined();
    expect(within(first).getByText('No')).toBeDefined();

    // Una creación no trae valor anterior; el que la hizo no se conoce y se dice
    const second = items[1] as HTMLElement;
    expect(within(second).getByText('Creación')).toBeDefined();
    expect(within(second).getByText('Cupones')).toBeDefined();
    await user.click(within(second).getByRole('button'));
    expect(within(second).getByText('VERANO')).toBeDefined();
    expect(within(second).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(second).getByText(/Lo hizo el sistema/)).toBeDefined();
    expect(screen.getByText('2 registros')).toBeDefined();
  });

  it('shows the saved texts as they are when they are not JSON', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/audit-log': json(
        page([entry({ previousValue: 'Pending', newValue: 'Paid' })]),
      ),
    });
    renderApp('/admin/audit');

    await user.click(await screen.findByRole('button', { name: /Cambio de estado/ }));
    expect(await screen.findByText('Pending')).toBeDefined();
    expect(screen.getByText('Paid')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows each record closed, opens it on click and closes it again', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/audit-log': json(
        page([entry(), entry({ idAuditLog: '40', entityKey: '9' })]),
      ),
    });
    renderApp('/admin/audit');

    const [first, second] = await screen.findAllByRole('button', { name: /Cambio de estado/ });
    expect(first?.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Activo')).toBeNull();

    await user.click(first as HTMLElement);
    expect(first?.getAttribute('aria-expanded')).toBe('true');
    expect(first?.getAttribute('aria-controls')).toBeTruthy();
    expect(screen.getAllByText('Activo')).toHaveLength(1);
    // Cada registro se abre por su cuenta
    expect(second?.getAttribute('aria-expanded')).toBe('false');

    await user.click(second as HTMLElement);
    expect(screen.getAllByText('Activo')).toHaveLength(2);

    await user.click(first as HTMLElement);
    expect(first?.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByText('Activo')).toHaveLength(1);
  });

  it('opens a record with the keyboard', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({ 'GET /api/v1/admin/audit-log': json(page([entry()])) });
    renderApp('/admin/audit');

    const button = await screen.findByRole('button', { name: /Cambio de estado/ });
    button.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Activo')).toBeDefined();
  });

  it('filters by module and starts again from the first page', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/audit-log': json(page([entry()], 45)),
    });
    renderApp('/admin/audit?page=2');
    await screen.findByText('Cambio de estado');
    expect(lastQuery(calls).get('page')).toBe('2');

    await user.selectOptions(screen.getByLabelText('Módulo'), 'Cupones');

    await waitFor(() => {
      expect(lastQuery(calls).get('module')).toBe('Coupons');
    });
    expect(lastQuery(calls).get('page')).toBe('1');
  });

  it('searches by the identifier of the entity', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/admin/audit-log': json(page([entry()])) });
    renderApp('/admin/audit');
    await screen.findByText('Cambio de estado');

    await user.type(screen.getByLabelText('Identificador'), 'PED-2030-000007');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(lastQuery(calls).get('entityKey')).toBe('PED-2030-000007');
    });
  });

  it('filters by the first and the last day, the last one counted whole', async () => {
    await signInAs('Administrator');
    const { calls } = installFakeApi({ 'GET /api/v1/admin/audit-log': json(page([entry()])) });
    renderApp('/admin/audit');
    await screen.findByText('Cambio de estado');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2030-06-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2030-06-30' } });

    await waitFor(() => {
      const query = lastQuery(calls);
      expect(query.get('from')).toBe('2030-06-01T00:00:00-06:00');
      expect(query.get('to')).toBe('2030-07-01T06:00:00.000Z');
    });
  });

  it('reads the filters from the address and explains a range that is reversed', async () => {
    await signInAs('Administrator');
    const { calls } = installFakeApi({ 'GET /api/v1/admin/audit-log': json(page([entry()])) });
    renderApp('/admin/audit?module=Orders&from=2030-06-10&to=2030-06-01');

    expect(
      await screen.findByText('La fecha «Desde» no puede ser posterior a «Hasta».'),
    ).toBeDefined();
    expect(screen.getByLabelText<HTMLSelectElement>('Módulo').value).toBe('Orders');
    expect(calls.some((call) => call.path === '/api/v1/admin/audit-log')).toBe(false);
  });

  it('pages on the server', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/audit-log': json(page([entry()], 45)),
    });
    renderApp('/admin/audit');
    expect(await screen.findByText('Página 1 de 3')).toBeDefined();
    expect(lastQuery(calls).get('size')).toBe('15');

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(lastQuery(calls).get('page')).toBe('2');
    });
    expect(await screen.findByText('Página 2 de 3')).toBeDefined();
  });

  it('says so when nothing matches', async () => {
    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/admin/audit-log': json(page([])) });
    renderApp('/admin/audit?module=Branches');

    expect(await screen.findByText('No hay registros con esos datos')).toBeDefined();
  });

  it('shows the error of the server and lets it retry', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/admin/audit-log': () => {
        if (failing) return apiError(500, 'INTERNAL_ERROR');
        return json(page([entry()]));
      },
    });
    renderApp('/admin/audit');

    expect(await screen.findByRole('alert')).toBeDefined();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Cambio de estado')).toBeDefined();
  });

  it.each(['Operator', 'Customer'] as const)('keeps the log away from the %s', async (role) => {
    await signInAs(role);
    const { calls } = installFakeApi({ 'GET /api/v1/admin/audit-log': json(page([entry()])) });
    renderApp('/admin/audit');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path === '/api/v1/admin/audit-log')).toBe(false);
  });
});

describe('the audit log in the menu', () => {
  it('is offered to the administrator and not to the operator', async () => {
    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/admin/audit-log': json(page([])) });
    const administrator = renderApp('/admin/audit');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Bitácora' })).toBeDefined();
    administrator.unmount();
    cleanup();
    await resetSession();

    await signInAs('Operator');
    installFakeApi({});
    renderApp('/admin');
    const operatorHeader = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(operatorHeader).queryByRole('link', { name: 'Bitácora' })).toBeNull();
  });
});
