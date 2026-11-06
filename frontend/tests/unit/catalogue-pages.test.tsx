// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import { category, page, product, renderApp, resetSession } from './support/render';

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const categories = json([category(1, 'Pasteles'), category(2, 'Cupcakes')]);

const lastProductsCall = (calls: { path: string; search: string }[]) =>
  new URLSearchParams(calls.filter((call) => call.path === '/api/v1/products').at(-1)?.search);

describe('catalogue page', () => {
  it('lists the products with their prices, states and the number of results', async () => {
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(
        page(
          [
            product(1, 'Pastel Tres Leches', '145.00', '260.00', { leadTimeDays: 1 }),
            product(2, 'Galletas de avena', '45.00', '45.00', { leadTimeDays: 0 }),
            product(3, 'Pastel Moka', '285.00', '285.00', { available: 0 }),
            product(4, 'Cupcakes de Fresa', '80.00', '80.00', { available: 3 }),
          ],
          { total: 4 },
        ),
      ),
    });
    renderApp('/catalogue');

    expect(await screen.findByRole('heading', { level: 1, name: 'Catálogo' })).toBeDefined();
    expect(await screen.findByText('4 productos')).toBeDefined();
    expect(screen.getByText('Desde Q145.00')).toBeDefined();
    expect(screen.getByText('Q45.00')).toBeDefined();
    expect(screen.getByText('Agotado')).toBeDefined();
    expect(screen.getByText('Pocas unidades')).toBeDefined();
    // Tres de los cuatro productos piden un día; el que se prepara el mismo día no muestra el aviso
    expect(screen.getAllByText('1 día de anticipación')).toHaveLength(3);
    const link = screen.getByRole('link', { name: /Pastel Tres Leches/ });
    expect(link.getAttribute('href')).toBe('/catalogue/1');
  });

  it('shows a skeleton while the first page loads', async () => {
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': () => new Promise<Response>(() => undefined),
    });
    renderApp('/catalogue');
    const status = await screen.findAllByRole('status');
    expect(status.some((node) => node.getAttribute('aria-label') === 'Cargando…')).toBe(true);
  });

  it('shows the empty state with a way out when the filters leave nothing', async () => {
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([], { total: 0 })),
    });
    renderApp('/catalogue?q=zzz');
    expect(await screen.findByText('No encontramos productos')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Quitar filtros' }).length).toBeGreaterThan(0);
  });

  it('shows the error in Spanish and recovers when the customer retries', async () => {
    let fail = true;
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': () =>
        fail
          ? apiError(500, 'UNEXPECTED')
          : json(page([product(1, 'Pastel Tres Leches', '145.00')])),
    });
    renderApp('/catalogue');
    expect(await screen.findByText('No pudimos cargar esto')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Ocurrió un error inesperado');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Pastel Tres Leches')).toBeDefined();
  });

  it('asks the server for the search that is in the address', async () => {
    const { calls } = installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')])),
    });
    renderApp('/catalogue?q=pastel&category=2&sort=newest&min=100&available=true&page=2');
    await screen.findByText('Pastel');
    const query = lastProductsCall(calls);
    expect(Object.fromEntries(query)).toEqual({
      q: 'pastel',
      category: '2',
      sort: 'newest',
      min: '100.00',
      available: 'true',
      page: '2',
      size: '12',
    });
  });

  it('puts the category, the sort and the availability in the address and goes back to page 1', async () => {
    const { calls } = installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')], { total: 30 })),
    });
    const { router } = renderApp('/catalogue?page=3');
    await screen.findByText('Pastel');

    await userEvent.click(await screen.findByRole('button', { name: 'Cupcakes' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?category=2');
    });

    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'price_desc');
    await waitFor(() => {
      expect(router.state.location.search).toBe('?category=2&sort=price_desc');
    });

    await userEvent.click(screen.getByLabelText('Solo con existencias'));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?category=2&available=true&sort=price_desc');
    });
    expect(Object.fromEntries(lastProductsCall(calls))).toMatchObject({
      category: '2',
      available: 'true',
      sort: 'price_desc',
      page: '1',
    });
  });

  it('waits until the customer stops typing before searching', async () => {
    const { calls } = installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')])),
    });
    const { router } = renderApp('/catalogue');
    await screen.findByText('Pastel');
    const before = calls.filter((call) => call.path === '/api/v1/products').length;

    // Pegar el texto es un solo evento: no depende de cuánto tarde cada tecla bajo carga, y el retraso se mide limpio
    await userEvent.click(screen.getByLabelText('Buscar'));
    await userEvent.paste('tres leches');
    expect(calls.filter((call) => call.path === '/api/v1/products')).toHaveLength(before);
    await waitFor(
      () => {
        expect(router.state.location.search).toBe('?q=tres+leches');
      },
      {
        timeout: 4000,
      },
    );
    // La dirección cambia primero y la petición sale un instante después: se espera, no se asume
    await waitFor(() => {
      expect(lastProductsCall(calls).get('q')).toBe('tres leches');
    });
  });

  it('normalises a price typed by the customer when the box loses focus', async () => {
    const { router } = renderApp('/catalogue');
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')])),
    });
    await userEvent.type(await screen.findByLabelText('Precio desde'), '99,5');
    await userEvent.tab();
    await waitFor(() => {
      expect(router.state.location.search).toBe('?min=99.50');
    });
    expect(screen.getByLabelText<HTMLInputElement>('Precio desde').value).toBe('99.50');
  });

  it('folds the price, sort and availability filters on a phone behind a button', async () => {
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')])),
    });
    renderApp('/catalogue');
    await screen.findByText('Pastel');
    const toggle = screen.getByRole('button', { name: 'Filtros' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('catalogue-more-filters');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens those filters from the start when one of them is already applied', async () => {
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')])),
    });
    renderApp('/catalogue?min=100');
    await screen.findByText('Pastel');
    expect(screen.getByRole('button', { name: 'Filtros' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('reserves the place of the categories while they load', async () => {
    installFakeApi({
      'GET /api/v1/categories': () => new Promise<Response>(() => undefined),
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')])),
    });
    renderApp('/catalogue');
    await screen.findByText('Pastel');
    const nav = screen.getByRole('navigation', { name: 'Categoría' });
    expect(nav.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  });

  it('clears every filter at once', async () => {
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')])),
    });
    const { router } = renderApp('/catalogue?category=1&available=true');
    await screen.findByText('Pastel');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
  });

  it('paginates on the server and keeps the page in the address', async () => {
    const { calls } = installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')], { total: 30 })),
    });
    const { router } = renderApp('/catalogue');
    const nav = await screen.findByRole('navigation', { name: 'Paginación' });
    expect(within(nav).getByText('Página 1 de 3')).toBeDefined();
    expect(within(nav).getByRole('button', { name: 'Anterior' }).hasAttribute('disabled')).toBe(
      true,
    );

    await userEvent.click(within(nav).getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?page=2');
    });
    expect(lastProductsCall(calls).get('page')).toBe('2');
    expect(await screen.findByText('Página 2 de 3')).toBeDefined();
  });

  it('does not show pagination when everything fits in one page', async () => {
    installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel', '10.00')])),
    });
    renderApp('/catalogue');
    await screen.findByText('Pastel');
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });
});

describe('product page', () => {
  const detail = (extra = {}) =>
    json({
      idProduct: 7,
      idCategory: 1,
      categoryName: 'Pasteles',
      name: 'Pastel Tres Leches',
      description: 'Bizcocho esponjoso bañado en tres leches.',
      leadTimeDays: 1,
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
          idVariant: 12,
          sku: 'PAS-3L-12',
          price: '260.00',
          onHandStock: 3,
          available: 3,
          isActive: true,
          attributes: [{ name: 'Tamaño', value: '12 porciones' }],
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
      ...extra,
    });

  it('shows the product, preselects the first variant that can be bought and its price', async () => {
    installFakeApi({ 'GET /api/v1/products/7': detail() });
    renderApp('/catalogue/7');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pastel Tres Leches' }),
    ).toBeDefined();
    expect(screen.getByText('Bizcocho esponjoso bañado en tres leches.')).toBeDefined();
    expect(screen.getByText('Q145.00')).toBeDefined();
    expect(screen.getByText('Código PAS-3L-06')).toBeDefined();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '6 porciones' }).checked).toBe(true);
    expect(screen.getByText(/pídalo con 1 día de anticipación/)).toBeDefined();
  });

  it('changes the price and the stock message when another variant is chosen', async () => {
    installFakeApi({ 'GET /api/v1/products/7': detail() });
    renderApp('/catalogue/7');
    await userEvent.click(await screen.findByRole('radio', { name: '12 porciones' }));
    expect(screen.getByText('Q260.00')).toBeDefined();
    expect(screen.getByText('Quedan 3 unidades')).toBeDefined();

    await userEvent.click(screen.getByRole('radio', { name: '24 porciones' }));
    expect(screen.getByText('Q480.00')).toBeDefined();
    expect(screen.getByText('Agotado por ahora')).toBeDefined();
  });

  it('says a same-day product can be ready the same day', async () => {
    installFakeApi({ 'GET /api/v1/products/7': detail({ leadTimeDays: 0 }) });
    renderApp('/catalogue/7');
    expect(await screen.findByText(/puede estar listo el mismo día/)).toBeDefined();
  });

  it('shows the not-found view when the product does not exist', async () => {
    installFakeApi({ 'GET /api/v1/products/99': apiError(404, 'NOT_FOUND') });
    renderApp('/catalogue/99');
    expect(await screen.findByText('Este producto no existe')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Volver al catálogo' })).toBeDefined();
  });

  it('does not even ask the server for an address that is not a product number', async () => {
    const { calls } = installFakeApi({});
    renderApp('/catalogue/abc');
    expect(await screen.findByText('Este producto no existe')).toBeDefined();
    expect(calls).toEqual([]);
  });

  it('shows the error state with a retry for any other failure', async () => {
    installFakeApi({ 'GET /api/v1/products/7': apiError(500, 'UNEXPECTED') });
    renderApp('/catalogue/7');
    expect(await screen.findByText('No pudimos cargar esto')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
  });
});

describe('home page', () => {
  it('shows the offer, the trust strip, the categories and the newest products', async () => {
    const { calls } = installFakeApi({
      'GET /api/v1/categories': categories,
      'GET /api/v1/products': json(page([product(1, 'Pastel Tres Leches', '145.00')])),
    });
    renderApp('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Pasteles que se hornean/ }),
    ).toBeDefined();
    expect(screen.getByText('Hecho por encargo', { selector: 'p.font-display' })).toBeDefined();
    expect(screen.getByText('Existencias apartadas')).toBeDefined();
    expect(await screen.findByRole('link', { name: 'Cupcakes' })).toBeDefined();
    expect(await screen.findByText('Pastel Tres Leches')).toBeDefined();
    const query = lastProductsCall(calls);
    expect(query.get('sort')).toBe('newest');
    expect(query.get('size')).toBe('4');
  });

  it('shows an unknown address as a page that does not exist', async () => {
    installFakeApi({});
    renderApp('/no-such-page');
    expect(await screen.findByText('Esta página no existe')).toBeDefined();
  });
});
