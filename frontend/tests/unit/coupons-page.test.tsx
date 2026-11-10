// cspell:disable
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import type { Call } from './support/fake-api';
import { category, renderApp, resetSession, signInAs } from './support/render';

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

const tree = () => [category(1, 'Pasteles'), category(2, 'Galletas')];

const coupon = (extra = {}) => ({
  idCoupon: 5,
  code: 'VERANO10',
  type: 'Percentage',
  value: '10.00',
  minimumAmount: '100.00',
  startsAt: '2030-06-01T06:00:00Z',
  endsAt: '2030-07-01T06:00:00Z',
  totalUsageLimit: 50,
  perCustomerUsageLimit: 1,
  usageCount: 3,
  idCategory: 1,
  isActive: true,
  status: 'Active',
  ...extra,
});

const page = (items: unknown[], total = items.length) => ({ items, page: 1, size: 20, total });

const lastQuery = (calls: Call[]): URLSearchParams =>
  new URLSearchParams(calls.filter((call) => call.path === '/api/v1/admin/coupons').at(-1)?.search);

const sent = (calls: Call[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

const open = async (
  items: unknown[],
  extra: Record<string, unknown> = {},
  url = '/admin/coupons',
) => {
  await signInAs('Administrator');
  const fake = installFakeApi({
    'GET /api/v1/categories': json(tree()),
    'GET /api/v1/admin/coupons': json(page(items)),
    ...extra,
  });
  renderApp(url);
  return fake;
};

describe('the coupons screen', () => {
  it('lists each coupon with its discount, validity, minimum, category, uses and status', async () => {
    await open([
      coupon(),
      coupon({
        idCoupon: 6,
        code: 'FIJO25',
        type: 'FixedAmount',
        value: '25.00',
        minimumAmount: '0.00',
        idCategory: null,
        totalUsageLimit: null,
        perCustomerUsageLimit: null,
        usageCount: 0,
        status: 'Expired',
      }),
    ]);

    expect(await screen.findByRole('heading', { level: 1, name: 'Cupones' })).toBeDefined();
    const first = (await screen.findByText('VERANO10')).closest('li') as HTMLElement;
    expect(within(first).getByText('10 % de descuento')).toBeDefined();
    expect(within(first).getByText('Vigente')).toBeDefined();
    expect(within(first).getByText(/Rige del/)).toBeDefined();
    expect(within(first).getByText(/Compra mínima de/)).toBeDefined();
    expect(await within(first).findByText('Solo para la categoría Pasteles')).toBeDefined();
    expect(within(first).getByText(/Se usó 3 de 50 veces/)).toBeDefined();
    expect(within(first).getByText(/una vez por cliente/)).toBeDefined();

    const second = screen.getByText('FIJO25').closest('li') as HTMLElement;
    expect(within(second).getByText(/de descuento/)).toBeDefined();
    expect(within(second).getByText('Vencido')).toBeDefined();
    expect(within(second).getByText('Para todo el catálogo')).toBeDefined();
    expect(within(second).getByText('Se usó 0 veces')).toBeDefined();
    expect(within(second).queryByText(/Compra mínima de/)).toBeNull();
    expect(screen.getByText('2 cupones')).toBeDefined();
  });

  it('names every state of a coupon', async () => {
    await open([
      coupon({ idCoupon: 1, code: 'A1', status: 'NotStarted' }),
      coupon({ idCoupon: 2, code: 'A2', status: 'Exhausted' }),
      coupon({ idCoupon: 3, code: 'A3', status: 'Inactive', isActive: false }),
    ]);

    await screen.findByText('A1');
    expect(screen.getByText('Aún no empieza')).toBeDefined();
    expect(screen.getByText('Agotado')).toBeDefined();
    expect(screen.getByText('Desactivado')).toBeDefined();
  });

  it('hides the deactivated ones until they are asked for, and keeps the choice in the address', async () => {
    const user = userEvent.setup();
    const { calls } = await open([coupon()]);
    await screen.findByText('VERANO10');
    expect(lastQuery(calls).get('includeInactive')).toBe('false');

    await user.click(screen.getByLabelText('Mostrar también los desactivados'));

    await waitFor(() => {
      expect(lastQuery(calls).get('includeInactive')).toBe('true');
    });
  });

  it('reads the filter and the page from the address', async () => {
    const { calls } = await open([coupon()], {}, '/admin/coupons?inactive=true&page=2');

    await screen.findByText('VERANO10');
    expect(lastQuery(calls).get('includeInactive')).toBe('true');
    expect(lastQuery(calls).get('page')).toBe('2');
    expect(
      screen.getByLabelText<HTMLInputElement>('Mostrar también los desactivados').checked,
    ).toBe(true);
  });

  it('pages on the server', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/admin/coupons': json(page([coupon()], 45)),
    });
    renderApp('/admin/coupons');
    expect(await screen.findByText('Página 1 de 3')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(lastQuery(calls).get('page')).toBe('2');
    });
  });

  it('says so when there are no coupons', async () => {
    await open([]);

    expect(await screen.findByText('No hay cupones')).toBeDefined();
  });

  it('shows the error of the server and lets it retry', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/admin/coupons': () => {
        if (failing) return apiError(500, 'INTERNAL_ERROR');
        return json(page([coupon()]));
      },
    });
    renderApp('/admin/coupons');

    await screen.findByRole('button', { name: 'Reintentar' });
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('VERANO10')).toBeDefined();
  });

  it('offers no actions on a coupon that is deactivated', async () => {
    await open([coupon({ status: 'Inactive', isActive: false })]);

    const card = (await screen.findByText('VERANO10')).closest('li') as HTMLElement;
    expect(within(card).queryByRole('button')).toBeNull();
  });
});

describe('creating a coupon', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, form: HTMLElement) => {
    await user.type(within(form).getByLabelText('Código'), 'otono15');
    await user.type(within(form).getByLabelText('Valor'), '15');
    fireEvent.change(within(form).getByLabelText('Primer día'), {
      target: { value: '2030-09-01' },
    });
    fireEvent.change(within(form).getByLabelText('Último día'), {
      target: { value: '2030-09-30' },
    });
  };

  it('sends the coupon with its code in capitals, the days as whole days and an idempotency key', async () => {
    const user = userEvent.setup();
    const { calls } = await open([], {
      'POST /api/v1/admin/coupons': json({ idCoupon: 9 }, { status: 201 }),
    });
    await user.click(await screen.findByRole('button', { name: 'Nuevo cupón' }));
    const form = screen.getByRole('form', { name: 'Nuevo cupón' });
    await fill(user, form);
    await user.type(within(form).getByLabelText(/^Compra mínima/), '99,5');
    await user.type(within(form).getByLabelText(/^Usos en total/), '40');
    await user.selectOptions(within(form).getByLabelText(/^Solo para una categoría/), 'Galletas');

    await user.click(within(form).getByRole('button', { name: 'Crear cupón' }));

    await waitFor(() => {
      expect(sent(calls, 'POST', '/api/v1/admin/coupons')).toHaveLength(1);
    });
    const request = sent(calls, 'POST', '/api/v1/admin/coupons')[0];
    expect(request?.body).toEqual({
      code: 'OTONO15',
      type: 'Percentage',
      value: '15.00',
      minimumAmount: '99.50',
      startsAt: '2030-09-01T00:00:00-06:00',
      endsAt: '2030-10-01T06:00:00.000Z',
      totalUsageLimit: 40,
      perCustomerUsageLimit: null,
      categoryId: 2,
    });
    expect(request?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('explains what is missing and sends nothing', async () => {
    const user = userEvent.setup();
    const { calls } = await open([]);
    await user.click(await screen.findByRole('button', { name: 'Nuevo cupón' }));
    const form = screen.getByRole('form', { name: 'Nuevo cupón' });

    await user.click(within(form).getByRole('button', { name: 'Crear cupón' }));

    expect(await within(form).findByText(/Use de 3 a 30 letras/)).toBeDefined();
    expect(within(form).getByText(/Escriba un valor mayor que cero/)).toBeDefined();
    expect(within(form).getAllByText('Elija un día.')).toHaveLength(2);
    expect(sent(calls, 'POST', '/api/v1/admin/coupons')).toHaveLength(0);
  });

  it('does not accept a percentage above 100 nor a last day before the first', async () => {
    const user = userEvent.setup();
    await open([]);
    await user.click(await screen.findByRole('button', { name: 'Nuevo cupón' }));
    const form = screen.getByRole('form', { name: 'Nuevo cupón' });
    await user.type(within(form).getByLabelText('Código'), 'MAL');
    await user.type(within(form).getByLabelText('Valor'), '150');
    fireEvent.change(within(form).getByLabelText('Primer día'), {
      target: { value: '2030-09-10' },
    });
    fireEvent.change(within(form).getByLabelText('Último día'), {
      target: { value: '2030-09-01' },
    });

    await user.click(within(form).getByRole('button', { name: 'Crear cupón' }));

    expect(await within(form).findByText('Un porcentaje no puede pasar de 100.')).toBeDefined();
    expect(within(form).getByText('El último día no puede ser anterior al primero.')).toBeDefined();
  });

  it('changes the hint of the value with the type of discount', async () => {
    const user = userEvent.setup();
    await open([]);
    await user.click(await screen.findByRole('button', { name: 'Nuevo cupón' }));
    const form = screen.getByRole('form', { name: 'Nuevo cupón' });
    expect(within(form).getByText('Porcentaje entre 1 y 100.')).toBeDefined();

    await user.selectOptions(within(form).getByLabelText('Tipo de descuento'), 'Monto fijo');

    expect(within(form).getByText('Monto en quetzales.')).toBeDefined();
  });

  it('shows the reason when the code already exists', async () => {
    const user = userEvent.setup();
    await open([], { 'POST /api/v1/admin/coupons': apiError(409, 'CONFLICT') });
    await user.click(await screen.findByRole('button', { name: 'Nuevo cupón' }));
    const form = screen.getByRole('form', { name: 'Nuevo cupón' });
    await fill(user, form);

    await user.click(within(form).getByRole('button', { name: 'Crear cupón' }));

    expect(await within(form).findByRole('alert')).toBeDefined();
    // El formulario sigue abierto para corregir
    expect(screen.getByRole('form', { name: 'Nuevo cupón' })).toBeDefined();
  });

  it('closes without creating anything', async () => {
    const user = userEvent.setup();
    const { calls } = await open([]);
    await user.click(await screen.findByRole('button', { name: 'Nuevo cupón' }));
    const form = screen.getByRole('form', { name: 'Nuevo cupón' });

    await user.click(within(form).getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('form', { name: 'Nuevo cupón' })).toBeNull();
    expect(sent(calls, 'POST', '/api/v1/admin/coupons')).toHaveLength(0);
  });
});

describe('editing a coupon', () => {
  it('opens the form with what the coupon has, without the code, and sends the change', async () => {
    const user = userEvent.setup();
    const { calls } = await open([coupon()], {
      'PUT /api/v1/admin/coupons/5': json({ idCoupon: 5 }),
    });
    const card = (await screen.findByText('VERANO10')).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Editar' }));

    const form = screen.getByRole('form', { name: 'Editar cupón' });
    expect(within(form).queryByLabelText('Código')).toBeNull();
    expect(within(form).getByLabelText<HTMLInputElement>('Valor').value).toBe('10.00');
    expect(within(form).getByLabelText<HTMLInputElement>('Primer día').value).toBe('2030-06-01');
    expect(within(form).getByLabelText<HTMLInputElement>('Último día').value).toBe('2030-06-30');

    await user.clear(within(form).getByLabelText('Valor'));
    await user.type(within(form).getByLabelText('Valor'), '12');
    await user.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(sent(calls, 'PUT', '/api/v1/admin/coupons/5')).toHaveLength(1);
    });
    const body = sent(calls, 'PUT', '/api/v1/admin/coupons/5')[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      type: 'Percentage',
      value: '12.00',
      minimumAmount: '100.00',
      startsAt: '2030-06-01T00:00:00-06:00',
      endsAt: '2030-07-01T06:00:00.000Z',
      totalUsageLimit: 50,
      perCustomerUsageLimit: 1,
      categoryId: 1,
    });
    expect(body).not.toHaveProperty('code');
  });

  it('shows the reason when the server refuses the change', async () => {
    const user = userEvent.setup();
    await open([coupon()], { 'PUT /api/v1/admin/coupons/5': apiError(422, 'UNPROCESSABLE') });
    const card = (await screen.findByText('VERANO10')).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Editar' }));
    const form = screen.getByRole('form', { name: 'Editar cupón' });

    await user.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(form).findByRole('alert')).toBeDefined();
  });
});

describe('deactivating a coupon', () => {
  it('asks first, then deactivates and reads the list again', async () => {
    const user = userEvent.setup();
    let listed = 0;
    const { calls } = await open([], {
      'GET /api/v1/admin/coupons': () => {
        listed += 1;
        return json(page(listed === 1 ? [coupon()] : []));
      },
      'DELETE /api/v1/admin/coupons/5': json({ idCoupon: 5 }),
    });
    const card = (await screen.findByText('VERANO10')).closest('li') as HTMLElement;

    await user.click(within(card).getByRole('button', { name: 'Desactivar' }));
    expect(within(card).getByText('¿Desactivar este cupón?')).toBeDefined();
    expect(sent(calls, 'DELETE', '/api/v1/admin/coupons/5')).toHaveLength(0);

    await user.click(within(card).getByRole('button', { name: 'Sí, desactivarlo' }));

    await waitFor(() => {
      expect(sent(calls, 'DELETE', '/api/v1/admin/coupons/5')).toHaveLength(1);
    });
    expect(await screen.findByText('No hay cupones')).toBeDefined();
  });

  it('keeps the coupon when the administrator changes their mind', async () => {
    const user = userEvent.setup();
    const { calls } = await open([coupon()]);
    const card = (await screen.findByText('VERANO10')).closest('li') as HTMLElement;

    await user.click(within(card).getByRole('button', { name: 'Desactivar' }));
    await user.click(within(card).getByRole('button', { name: 'No, conservarlo' }));

    expect(within(card).queryByText('¿Desactivar este cupón?')).toBeNull();
    expect(sent(calls, 'DELETE', '/api/v1/admin/coupons/5')).toHaveLength(0);
  });

  it('shows the reason when the server refuses', async () => {
    const user = userEvent.setup();
    await open([coupon()], { 'DELETE /api/v1/admin/coupons/5': apiError(404, 'NOT_FOUND') });
    const card = (await screen.findByText('VERANO10')).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Desactivar' }));

    await user.click(within(card).getByRole('button', { name: 'Sí, desactivarlo' }));

    expect(await within(card).findByRole('alert')).toBeDefined();
  });
});

describe('who can open the coupons', () => {
  it.each(['Operator', 'Customer'] as const)('keeps them away from the %s', async (role) => {
    await signInAs(role);
    const { calls } = installFakeApi({ 'GET /api/v1/admin/coupons': json(page([coupon()])) });
    renderApp('/admin/coupons');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path === '/api/v1/admin/coupons')).toBe(false);
  });

  it('is offered in the menu to the administrator and not to the operator', async () => {
    await signInAs('Administrator');
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/admin/coupons': json(page([])),
    });
    const administrator = renderApp('/admin/coupons');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Cupones' })).toBeDefined();
    administrator.unmount();
    cleanup();
    await resetSession();

    await signInAs('Operator');
    installFakeApi({});
    renderApp('/admin');
    const operatorHeader = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(operatorHeader).queryByRole('link', { name: 'Cupones' })).toBeNull();
  });
});
