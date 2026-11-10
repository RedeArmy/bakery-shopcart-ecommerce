// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import type { Call } from './support/fake-api';
import { category, page, product, renderApp, resetSession, signInAs } from './support/render';

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

// Las categorías de la administración llegan en una lista plana y desordenada, con las desactivadas
const flat = () => [
  { ...category(1, 'Tartas'), activeProducts: 4 },
  {
    ...category(2, 'Frutales'),
    idParentCategory: 1,
    description: 'De temporada',
    activeProducts: 1,
  },
  { ...category(3, 'Panes'), activeProducts: 0 },
  { ...category(4, 'Antiguas'), isActive: false, activeProducts: 0 },
];

// El árbol que usan los selectores
const tree = () => [
  { ...category(1, 'Tartas'), children: [{ ...category(2, 'Frutales'), children: [] }] },
  category(3, 'Panes'),
];

const catalogueProduct = (extra = {}) => ({
  ...product(7, 'Pastel tres leches', '90.00', '180.00'),
  ...extra,
});

const variant = (extra = {}) => ({
  idVariant: 21,
  sku: 'TL-GRANDE',
  price: '180.00',
  unitsPerPack: 1,
  isActive: true,
  attributes: [{ name: 'Tamaño', value: 'Grande' }],
  ...extra,
});

const detail = (variants: unknown[] = [variant()]) => ({
  ...catalogueProduct(),
  images: [],
  variants,
});

const sent = (calls: Call[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

const open = async (url: string, extra: Record<string, unknown> = {}) => {
  await signInAs('Administrator');
  const fake = installFakeApi({
    'GET /api/v1/admin/categories': json(flat()),
    'GET /api/v1/categories': json(tree()),
    'GET /api/v1/admin/products': json(page([catalogueProduct()])),
    'GET /api/v1/admin/products/7': json(detail()),
    ...extra,
  });
  renderApp(url);
  return fake;
};

describe('the categories', () => {
  it('lists all of them, the main ones alphabetically with their own below, and what each one holds', async () => {
    await open('/admin/catalogue');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mantenimiento del catálogo' }),
    ).toBeDefined();
    await screen.findByRole('heading', { name: 'Tartas' });
    const names = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(names).toEqual(['Antiguas', 'Panes', 'Tartas', 'Frutales']);
    const fruit = screen.getByRole('heading', { name: 'Frutales' }).closest('li') as HTMLElement;
    expect(within(fruit).getByText('De temporada')).toBeDefined();
    expect(within(fruit).getByText(/Dentro de Tartas/)).toBeDefined();
    expect(within(fruit).getByText(/1 producto activo/)).toBeDefined();
    const tarts = screen.getByRole('heading', { name: 'Tartas' }).closest('li') as HTMLElement;
    expect(within(tarts).getByText(/Categoría principal · 4 productos activos/)).toBeDefined();
  });

  it('offers no actions on a category that is deactivated', async () => {
    await open('/admin/catalogue');

    const old = (await screen.findByRole('heading', { name: 'Antiguas' })).closest(
      'li',
    ) as HTMLElement;
    expect(within(old).getByText('Desactivado')).toBeDefined();
    expect(within(old).queryByRole('button')).toBeNull();
  });

  it('creates a category with an idempotency key and the empty fields as null', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue', {
      'POST /api/v1/admin/categories': json({ idCategory: 9 }, { status: 201 }),
    });
    await user.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    const form = screen.getByRole('form', { name: 'Nueva categoría' });

    await user.type(within(form).getByLabelText('Nombre de la categoría'), 'Galletas');
    await user.click(within(form).getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() => {
      expect(sent(calls, 'POST', '/api/v1/admin/categories')).toHaveLength(1);
    });
    const request = sent(calls, 'POST', '/api/v1/admin/categories')[0];
    expect(request?.body).toEqual({ name: 'Galletas', description: null, parentId: null });
    expect(request?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('puts a new category inside another one', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue', {
      'POST /api/v1/admin/categories': json({ idCategory: 9 }, { status: 201 }),
    });
    await user.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    const form = screen.getByRole('form', { name: 'Nueva categoría' });
    await user.type(within(form).getByLabelText('Nombre de la categoría'), 'Cumpleaños');
    await user.selectOptions(within(form).getByLabelText(/^Dentro de/), 'Tartas');

    await user.click(within(form).getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() => {
      expect(sent(calls, 'POST', '/api/v1/admin/categories')).toHaveLength(1);
    });
    expect(sent(calls, 'POST', '/api/v1/admin/categories')[0]?.body).toMatchObject({ parentId: 1 });
  });

  it('explains what is missing and sends nothing', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue');
    await user.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    const form = screen.getByRole('form', { name: 'Nueva categoría' });

    await user.click(within(form).getByRole('button', { name: 'Crear categoría' }));

    expect(await within(form).findByText('Escriba el nombre de la categoría.')).toBeDefined();
    expect(sent(calls, 'POST', '/api/v1/admin/categories')).toHaveLength(0);
  });

  it('shows the reason when the name already exists', async () => {
    const user = userEvent.setup();
    await open('/admin/catalogue', { 'POST /api/v1/admin/categories': apiError(409, 'CONFLICT') });
    await user.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    const form = screen.getByRole('form', { name: 'Nueva categoría' });
    await user.type(within(form).getByLabelText('Nombre de la categoría'), 'Panes');

    await user.click(within(form).getByRole('button', { name: 'Crear categoría' }));

    expect(await within(form).findByRole('alert')).toBeDefined();
  });

  it('edits a category and does not offer itself as its own parent', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue', {
      'PUT /api/v1/admin/categories/3': json({ idCategory: 3 }),
    });
    const card = (await screen.findByRole('heading', { name: 'Panes' })).closest(
      'li',
    ) as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Editar' }));
    const form = screen.getByRole('form', { name: 'Editar categoría' });
    expect(
      within(within(form).getByLabelText(/^Dentro de/)).queryByRole('option', { name: 'Panes' }),
    ).toBeNull();
    // Las desactivadas tampoco se ofrecen como padre
    expect(
      within(within(form).getByLabelText(/^Dentro de/)).queryByRole('option', { name: 'Antiguas' }),
    ).toBeNull();

    await user.clear(within(form).getByLabelText('Nombre de la categoría'));
    await user.type(within(form).getByLabelText('Nombre de la categoría'), 'Panes dulces');
    await user.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(sent(calls, 'PUT', '/api/v1/admin/categories/3')).toHaveLength(1);
    });
    expect(sent(calls, 'PUT', '/api/v1/admin/categories/3')[0]?.body).toEqual({
      name: 'Panes dulces',
      description: null,
      parentId: null,
    });
  });

  it('asks before deactivating and deactivates', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue', {
      'DELETE /api/v1/admin/categories/3': json({ idCategory: 3 }),
    });
    const card = (await screen.findByRole('heading', { name: 'Panes' })).closest(
      'li',
    ) as HTMLElement;

    await user.click(within(card).getByRole('button', { name: 'Desactivar' }));
    expect(within(card).getByText('¿Desactivar esta categoría?')).toBeDefined();
    expect(sent(calls, 'DELETE', '/api/v1/admin/categories/3')).toHaveLength(0);
    await user.click(within(card).getByRole('button', { name: 'Sí, desactivarla' }));

    await waitFor(() => {
      expect(sent(calls, 'DELETE', '/api/v1/admin/categories/3')).toHaveLength(1);
    });
  });

  it('shows the reason when the category still has active products', async () => {
    const user = userEvent.setup();
    await open('/admin/catalogue', {
      'DELETE /api/v1/admin/categories/1': apiError(422, 'UNPROCESSABLE'),
    });
    const card = (await screen.findByRole('heading', { name: 'Tartas' })).closest(
      'li',
    ) as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Desactivar' }));

    await user.click(within(card).getByRole('button', { name: 'Sí, desactivarla' }));

    expect(await within(card).findByRole('alert')).toBeDefined();
  });

  it('says so when there are no categories and shows the error with a retry', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/admin/categories': () => {
        if (failing) return apiError(500, 'INTERNAL_ERROR');
        return json([]);
      },
    });
    renderApp('/admin/catalogue');

    await screen.findByRole('button', { name: 'Reintentar' });
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Todavía no hay categorías')).toBeDefined();
  });
});

describe('the products', () => {
  it('moves between the two views and keeps the view in the address', async () => {
    const user = userEvent.setup();
    await open('/admin/catalogue');
    await screen.findByRole('heading', { name: 'Tartas' });

    await user.click(screen.getByRole('button', { name: 'Productos' }));

    expect(await screen.findByText('Elija una categoría para ver sus productos.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Productos' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('shows the products of the chosen category by name, also the deactivated ones, with their price range', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue?view=products', {
      'GET /api/v1/admin/products': json(
        page([
          catalogueProduct(),
          catalogueProduct({
            idProduct: 8,
            name: 'Pastel viejo',
            isActive: false,
            minPrice: '50.00',
            maxPrice: '50.00',
          }),
        ]),
      ),
    });
    await screen.findByRole('option', { name: 'Panes' });

    await user.selectOptions(screen.getByLabelText('Categoría'), 'Panes');

    const first = (await screen.findByRole('heading', { name: 'Pastel tres leches' })).closest(
      'li',
    ) as HTMLElement;
    expect(within(first).getByText(/Q90\.00 – Q180\.00/)).toBeDefined();
    const old = screen.getByRole('heading', { name: 'Pastel viejo' }).closest('li') as HTMLElement;
    expect(within(old).getByText('Desactivado')).toBeDefined();
    expect(within(old).queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(within(old).getByRole('button', { name: 'Precios' })).toBeDefined();
    const query = new URLSearchParams(
      calls.filter((call) => call.path === '/api/v1/admin/products').at(-1)?.search,
    );
    expect(query.get('category')).toBe('3');
    expect(query.get('sort')).toBe('name');
  });

  it('marks the products made to order and points to the inventory to create one', async () => {
    await open('/admin/catalogue?view=products&category=3', {
      'GET /api/v1/admin/products': json(page([catalogueProduct({ leadTimeDays: 3 })])),
    });

    expect(await screen.findByText('Por encargo: 3 días')).toBeDefined();
    expect(screen.getByRole('link', { name: 'inventario.' }).getAttribute('href')).toBe(
      '/admin/inventory',
    );
  });

  it('says so when the category has no products', async () => {
    await open('/admin/catalogue?view=products&category=3', {
      'GET /api/v1/admin/products': json(page([])),
    });

    expect(await screen.findByText('Esta categoría aún no tiene productos')).toBeDefined();
  });

  it('edits a product and sends the whole product without a row version', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue?view=products&category=3', {
      'PUT /api/v1/admin/products/7': json({ idProduct: 7 }),
    });
    const card = (await screen.findByRole('heading', { name: 'Pastel tres leches' })).closest(
      'li',
    ) as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Editar' }));
    const form = screen.getByRole('form', { name: 'Editar producto' });
    expect(within(form).getByLabelText<HTMLInputElement>('Nombre del producto').value).toBe(
      'Pastel tres leches',
    );

    await user.clear(within(form).getByLabelText('Nombre del producto'));
    await user.type(within(form).getByLabelText('Nombre del producto'), 'Pastel de tres leches');
    await user.clear(within(form).getByLabelText('Días de preparación'));
    await user.type(within(form).getByLabelText('Días de preparación'), '2');
    await user.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(sent(calls, 'PUT', '/api/v1/admin/products/7')).toHaveLength(1);
    });
    expect(sent(calls, 'PUT', '/api/v1/admin/products/7')[0]?.body).toEqual({
      categoryId: 1,
      name: 'Pastel de tres leches',
      description: null,
      leadTimeDays: 2,
    });
  });

  it('explains what is missing when editing and shows the reason of the server', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue?view=products&category=3', {
      'PUT /api/v1/admin/products/7': apiError(422, 'UNPROCESSABLE'),
    });
    const card = (await screen.findByRole('heading', { name: 'Pastel tres leches' })).closest(
      'li',
    ) as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Editar' }));
    const form = screen.getByRole('form', { name: 'Editar producto' });
    await user.clear(within(form).getByLabelText('Nombre del producto'));
    await user.click(within(form).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(form).findByText('Escriba el nombre del producto.')).toBeDefined();
    expect(sent(calls, 'PUT', '/api/v1/admin/products/7')).toHaveLength(0);

    await user.type(within(form).getByLabelText('Nombre del producto'), 'Otro');
    await user.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(form).findByRole('alert')).toBeDefined();
  });

  it('asks before deactivating a product and deactivates it', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue?view=products&category=3', {
      'DELETE /api/v1/admin/products/7': json({ idProduct: 7 }),
    });
    const card = (await screen.findByRole('heading', { name: 'Pastel tres leches' })).closest(
      'li',
    ) as HTMLElement;

    await user.click(within(card).getByRole('button', { name: 'Desactivar' }));
    expect(within(card).getByText('¿Desactivar este producto?')).toBeDefined();
    expect(sent(calls, 'DELETE', '/api/v1/admin/products/7')).toHaveLength(0);
    await user.click(within(card).getByRole('button', { name: 'Sí, desactivarlo' }));

    await waitFor(() => {
      expect(sent(calls, 'DELETE', '/api/v1/admin/products/7')).toHaveLength(1);
    });
  });

  it('keeps the product when the administrator changes their mind', async () => {
    const user = userEvent.setup();
    const { calls } = await open('/admin/catalogue?view=products&category=3');
    const card = (await screen.findByRole('heading', { name: 'Pastel tres leches' })).closest(
      'li',
    ) as HTMLElement;

    await user.click(within(card).getByRole('button', { name: 'Desactivar' }));
    await user.click(within(card).getByRole('button', { name: 'No, conservarlo' }));

    expect(within(card).queryByText('¿Desactivar este producto?')).toBeNull();
    expect(sent(calls, 'DELETE', '/api/v1/admin/products/7')).toHaveLength(0);
  });
});

describe('the prices of the variants', () => {
  const openPrices = async (variants: unknown[], extra: Record<string, unknown> = {}) => {
    const user = userEvent.setup();
    const fake = await open('/admin/catalogue?view=products&category=3', {
      'GET /api/v1/admin/products/7': json(detail(variants)),
      ...extra,
    });
    const card = (await screen.findByRole('heading', { name: 'Pastel tres leches' })).closest(
      'li',
    ) as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Precios' }));
    return { user, card, ...fake };
  };

  it('lists every variant with its price, also the ones that are no longer sold', async () => {
    const { card } = await openPrices([
      variant(),
      variant({
        idVariant: 22,
        sku: 'TL-CH',
        price: '90.00',
        isActive: false,
        attributes: [{ name: 'Tamaño', value: 'Chico' }],
      }),
    ]);

    expect(await within(card).findByText('Grande')).toBeDefined();
    expect(within(card).getByText('Q180.00')).toBeDefined();
    expect(within(card).getByText('Chico')).toBeDefined();
    expect(within(card).getByText('Ya no se vende')).toBeDefined();
  });

  it('says how many units a packaging holds', async () => {
    const { card } = await openPrices([variant({ unitsPerPack: 6 })]);

    expect(await within(card).findByText(/Trae 6 unidades por paquete/)).toBeDefined();
  });

  it('changes the price with two decimals and an idempotency key', async () => {
    const { user, card, calls } = await openPrices([variant()], {
      'PATCH /api/v1/admin/variants/21/price': json({ idVariant: 21, price: '195.50' }),
    });
    await user.click(await within(card).findByRole('button', { name: 'Cambiar precio' }));
    const form = within(card).getByRole('form', { name: 'Cambiar el precio de Grande' });

    await user.type(within(form).getByLabelText('Precio nuevo'), '195,5');
    await user.click(within(form).getByRole('button', { name: 'Guardar precio' }));

    await waitFor(() => {
      expect(sent(calls, 'PATCH', '/api/v1/admin/variants/21/price')).toHaveLength(1);
    });
    const request = sent(calls, 'PATCH', '/api/v1/admin/variants/21/price')[0];
    expect(request?.body).toEqual({ price: '195.50' });
    expect(request?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('does not send a price that is not an amount above zero', async () => {
    const { user, card, calls } = await openPrices([variant()]);
    await user.click(await within(card).findByRole('button', { name: 'Cambiar precio' }));
    const form = within(card).getByRole('form', { name: 'Cambiar el precio de Grande' });

    await user.type(within(form).getByLabelText('Precio nuevo'), '0');
    await user.click(within(form).getByRole('button', { name: 'Guardar precio' }));

    expect(await within(form).findByText(/Escriba un precio mayor que cero/)).toBeDefined();
    expect(sent(calls, 'PATCH', '/api/v1/admin/variants/21/price')).toHaveLength(0);
  });

  it('shows the reason when the server refuses the price', async () => {
    const { user, card } = await openPrices([variant()], {
      'PATCH /api/v1/admin/variants/21/price': apiError(422, 'UNPROCESSABLE'),
    });
    await user.click(await within(card).findByRole('button', { name: 'Cambiar precio' }));
    const form = within(card).getByRole('form', { name: 'Cambiar el precio de Grande' });
    await user.type(within(form).getByLabelText('Precio nuevo'), '99');

    await user.click(within(form).getByRole('button', { name: 'Guardar precio' }));

    expect(await within(form).findByRole('alert')).toBeDefined();
  });

  it('closes the form without changing anything', async () => {
    const { user, card, calls } = await openPrices([variant()]);
    await user.click(await within(card).findByRole('button', { name: 'Cambiar precio' }));
    const form = within(card).getByRole('form', { name: 'Cambiar el precio de Grande' });

    await user.click(within(form).getByRole('button', { name: 'Cancelar' }));

    expect(within(card).queryByRole('form')).toBeNull();
    expect(sent(calls, 'PATCH', '/api/v1/admin/variants/21/price')).toHaveLength(0);
  });
});

describe('who can open the maintenance', () => {
  it.each(['Operator', 'Customer'] as const)('keeps it away from the %s', async (role) => {
    await signInAs(role);
    const { calls } = installFakeApi({ 'GET /api/v1/admin/categories': json(flat()) });
    renderApp('/admin/catalogue');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path === '/api/v1/admin/categories')).toBe(false);
  });

  it('is offered in the menu to the administrator and not to the operator', async () => {
    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/admin/categories': json([]) });
    const administrator = renderApp('/admin/catalogue');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Productos' })).toBeDefined();
    administrator.unmount();
    cleanup();
    await resetSession();

    await signInAs('Operator');
    installFakeApi({});
    renderApp('/admin');
    const operatorHeader = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(operatorHeader).queryByRole('link', { name: 'Productos' })).toBeNull();
  });
});
