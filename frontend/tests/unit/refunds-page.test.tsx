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

const refund = (extra = {}) => ({
  idRefund: 4,
  idPayment: 8,
  idOrder: 12,
  orderNumber: 'PED-2030-000012',
  idReturn: null,
  amountText: '145.00',
  reason: 'Order cancelled: Customer asked',
  status: 'Pending',
  externalReference: null,
  createdAt: '2030-06-01T15:00:00Z',
  processedAt: null,
  ...extra,
});

const lastQuery = (calls: Call[]): URLSearchParams =>
  new URLSearchParams(calls.filter((call) => call.path === '/api/v1/admin/refunds').at(-1)?.search);

const patches = (calls: Call[], id: number) =>
  calls.filter(
    (call) => call.method === 'PATCH' && call.path === `/api/v1/admin/refunds/${String(id)}`,
  );

const open = async (
  items: unknown[],
  extra: Record<string, unknown> = {},
  url = '/admin/refunds',
) => {
  await signInAs('Administrator');
  const fake = installFakeApi({ 'GET /api/v1/admin/refunds': json(items), ...extra });
  renderApp(url);
  return fake;
};

describe('the refunds screen', () => {
  it('lists what has to be returned with its order, reason, date and status', async () => {
    await open([
      refund(),
      refund({ idRefund: 5, idOrder: 13, orderNumber: 'PED-2030-000013', amountText: '55.45' }),
    ]);

    expect(await screen.findByRole('heading', { level: 1, name: 'Reembolsos' })).toBeDefined();
    const first = (await screen.findByText('Q145.00')).closest('li') as HTMLElement;
    expect(
      within(first).getByRole('link', { name: 'Pedido PED-2030-000012' }).getAttribute('href'),
    ).toBe('/admin/orders/12');
    expect(within(first).getByText('Order cancelled: Customer asked')).toBeDefined();
    expect(within(first).getByText('Pendiente')).toBeDefined();
    expect(within(first).getByText(/Se pidió el/)).toBeDefined();
    expect(screen.getByText('2 reembolsos')).toBeDefined();
  });

  it('asks for the ones that wait by default and for the state that is chosen', async () => {
    const user = userEvent.setup();
    const { calls } = await open([refund()]);
    await screen.findByText('Q145.00');
    expect(lastQuery(calls).get('status')).toBe('Pending');
    expect(lastQuery(calls).get('limit')).toBe('100');
    expect(screen.getByRole('button', { name: 'Pendientes' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Fallidos' }));
    await waitFor(() => {
      expect(lastQuery(calls).get('status')).toBe('Failed');
    });

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => {
      expect(lastQuery(calls).has('status')).toBe(false);
    });
  });

  it('reads the state from the address', async () => {
    const { calls } = await open(
      [refund({ status: 'Processed' })],
      {},
      '/admin/refunds?status=Processed',
    );

    await screen.findByText('Procesado');
    expect(lastQuery(calls).get('status')).toBe('Processed');
    expect(screen.getByRole('button', { name: 'Procesados' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('says so when there are none', async () => {
    await open([]);

    expect(await screen.findByText('No hay reembolsos con ese estado')).toBeDefined();
  });

  it('shows the error of the server and lets it retry', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/admin/refunds': () => {
        if (failing) return apiError(500, 'INTERNAL_ERROR');
        return json([refund()]);
      },
    });
    renderApp('/admin/refunds');

    await screen.findByRole('button', { name: 'Reintentar' });
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Q145.00')).toBeDefined();
  });

  it('warns that only the most recent are shown when the list is as long as it can be', async () => {
    await open(Array.from({ length: 100 }, (_, index) => refund({ idRefund: index + 1 })));

    expect(await screen.findByText('Se muestran los 100 más recientes.')).toBeDefined();
  });
});

describe('marking a refund as processed', () => {
  const card = async () => (await screen.findByText('Q145.00')).closest('li') as HTMLElement;

  it('asks for the reference of the transfer and sends it with an idempotency key', async () => {
    const user = userEvent.setup();
    let listed = 0;
    const { calls } = await open([], {
      'GET /api/v1/admin/refunds': () => {
        listed += 1;
        return json(listed === 1 ? [refund()] : []);
      },
      'PATCH /api/v1/admin/refunds/4': json({ idRefund: 4, status: 'Processed' }),
    });
    const item = await card();

    await user.click(within(item).getByRole('button', { name: 'Marcar como procesado' }));
    const form = within(item).getByRole('form', { name: 'Marcar como procesado' });
    await user.type(within(form).getByLabelText('Referencia de la transferencia'), ' TRF-0001 ');
    await user.click(within(form).getByRole('button', { name: 'Confirmar que se devolvió' }));

    await waitFor(() => {
      expect(patches(calls, 4)).toHaveLength(1);
    });
    expect(patches(calls, 4)[0]?.body).toEqual({
      status: 'Processed',
      externalReference: 'TRF-0001',
    });
    expect(patches(calls, 4)[0]?.headers.get('Idempotency-Key')).toBeTruthy();
    // La lista se pidió de nuevo y ya no la trae entre las pendientes
    expect(await screen.findByText('No hay reembolsos con ese estado')).toBeDefined();
  });

  it('does not send anything without the reference', async () => {
    const user = userEvent.setup();
    const { calls } = await open([refund()]);
    const item = await card();
    await user.click(within(item).getByRole('button', { name: 'Marcar como procesado' }));
    const form = within(item).getByRole('form', { name: 'Marcar como procesado' });

    await user.click(within(form).getByRole('button', { name: 'Confirmar que se devolvió' }));

    expect(
      await within(form).findByText('Escriba la referencia de la transferencia.'),
    ).toBeDefined();
    expect(patches(calls, 4)).toHaveLength(0);
  });

  it('closes the form without changing anything', async () => {
    const user = userEvent.setup();
    const { calls } = await open([refund()]);
    const item = await card();
    await user.click(within(item).getByRole('button', { name: 'Marcar como procesado' }));
    const form = within(item).getByRole('form', { name: 'Marcar como procesado' });

    await user.click(within(form).getByRole('button', { name: 'Cancelar' }));

    expect(within(item).queryByRole('form')).toBeNull();
    expect(patches(calls, 4)).toHaveLength(0);
  });

  it('shows the reason when the server refuses', async () => {
    const user = userEvent.setup();
    await open([refund()], { 'PATCH /api/v1/admin/refunds/4': apiError(422, 'UNPROCESSABLE') });
    const item = await card();
    await user.click(within(item).getByRole('button', { name: 'Marcar como procesado' }));
    const form = within(item).getByRole('form', { name: 'Marcar como procesado' });
    await user.type(within(form).getByLabelText('Referencia de la transferencia'), 'TRF-1');

    await user.click(within(form).getByRole('button', { name: 'Confirmar que se devolvió' }));

    expect(await within(form).findByRole('alert')).toBeDefined();
  });
});

describe('marking a refund as failed', () => {
  it('asks first and then sends the state without a reference', async () => {
    const user = userEvent.setup();
    const { calls } = await open([refund()], {
      'PATCH /api/v1/admin/refunds/4': json({ idRefund: 4, status: 'Failed' }),
    });
    const item = (await screen.findByText('Q145.00')).closest('li') as HTMLElement;

    await user.click(within(item).getByRole('button', { name: 'No se pudo devolver' }));
    expect(within(item).getByText('¿Marcar como fallido?')).toBeDefined();
    expect(patches(calls, 4)).toHaveLength(0);

    await user.click(within(item).getByRole('button', { name: 'Sí, marcar como fallido' }));

    await waitFor(() => {
      expect(patches(calls, 4)).toHaveLength(1);
    });
    expect(patches(calls, 4)[0]?.body).toEqual({ status: 'Failed' });
  });

  it('keeps it pending when the administrator changes their mind', async () => {
    const user = userEvent.setup();
    const { calls } = await open([refund()]);
    const item = (await screen.findByText('Q145.00')).closest('li') as HTMLElement;

    await user.click(within(item).getByRole('button', { name: 'No se pudo devolver' }));
    await user.click(within(item).getByRole('button', { name: 'No, dejarlo pendiente' }));

    expect(within(item).queryByText('¿Marcar como fallido?')).toBeNull();
    expect(patches(calls, 4)).toHaveLength(0);
  });

  it('lets a failed refund be processed later, but not failed again', async () => {
    await open([refund({ status: 'Failed' })], {}, '/admin/refunds?status=Failed');

    const item = (await screen.findByText('Q145.00')).closest('li') as HTMLElement;
    expect(within(item).getByText('Fallido')).toBeDefined();
    expect(within(item).getByRole('button', { name: 'Marcar como procesado' })).toBeDefined();
    expect(within(item).queryByRole('button', { name: 'No se pudo devolver' })).toBeNull();
  });
});

describe('a refund that is already processed', () => {
  it('shows its reference and date and offers nothing else', async () => {
    await open(
      [
        refund({
          status: 'Processed',
          externalReference: 'TRF-0001',
          processedAt: '2030-06-02T16:00:00Z',
        }),
      ],
      {},
      '/admin/refunds?status=Processed',
    );

    const item = (await screen.findByText('Q145.00')).closest('li') as HTMLElement;
    expect(within(item).getByText('Procesado')).toBeDefined();
    expect(within(item).getByText(/Referencia: TRF-0001/)).toBeDefined();
    expect(within(item).getByText(/Se procesó el/)).toBeDefined();
    expect(within(item).queryByRole('button')).toBeNull();
  });
});

describe('who can open the refunds', () => {
  it.each(['Operator', 'Customer'] as const)('keeps them away from the %s', async (role) => {
    await signInAs(role);
    const { calls } = installFakeApi({ 'GET /api/v1/admin/refunds': json([refund()]) });
    renderApp('/admin/refunds');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path === '/api/v1/admin/refunds')).toBe(false);
  });

  it('is offered in the menu to the administrator and not to the operator', async () => {
    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/admin/refunds': json([]) });
    const administrator = renderApp('/admin/refunds');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Reembolsos' })).toBeDefined();
    administrator.unmount();
    cleanup();
    await resetSession();

    await signInAs('Operator');
    installFakeApi({});
    renderApp('/admin');
    const operatorHeader = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(operatorHeader).queryByRole('link', { name: 'Reembolsos' })).toBeNull();
  });
});
