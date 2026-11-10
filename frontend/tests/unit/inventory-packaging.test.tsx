// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { installFakeApi, json } from './support/fake-api';
import type { Call } from './support/fake-api';
import { category, page, product, renderApp, resetSession, signInAs } from './support/render';

beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const tree = () => [category(1, 'Pan dulce')];

// Champurradas: la docena guarda la existencia (21) y la bolsa de 6 (22) toma las unidades de ella
const dozen = (units: number, extra = {}) => ({
  idVariant: 21,
  sku: 'PAN-CHA-12',
  price: '35.00',
  unitsPerPack: 12,
  idStockHolder: 21,
  onHandStock: units,
  onHandPacks: Math.floor(units / 12),
  looseUnits: units % 12,
  available: Math.floor(units / 12),
  isActive: true,
  attributes: [{ name: 'Tamaño', value: 'Docena' }],
  ...extra,
});

const bag = (units: number, extra = {}) => ({
  idVariant: 22,
  sku: 'PAN-CHA-06',
  price: '19.00',
  unitsPerPack: 6,
  idStockHolder: 21,
  onHandStock: units,
  onHandPacks: Math.floor(units / 6),
  looseUnits: units % 6,
  available: Math.floor(units / 6),
  isActive: true,
  attributes: [{ name: 'Tamaño', value: 'Bolsa de 6' }],
  ...extra,
});

const detail = (variants: unknown[]) => ({
  ...product(7, 'Champurradas', '19.00', '35.00'),
  images: [],
  variants,
});

const champurradas = () => product(7, 'Champurradas', '19.00', '35.00');

const sent = (calls: Call[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

const open = async (role: 'Administrator' | 'Operator', variants: unknown[]) => {
  await signInAs(role);
  const routes = {
    'GET /api/v1/categories': json(tree()),
    'GET /api/v1/products': json(page([champurradas()])),
    'GET /api/v1/products/7': json(detail(variants)),
    'GET /api/v1/admin/products/7': json(detail(variants)),
    'GET /api/v1/admin/inventory/ledger': json({ items: [], page: 1, size: 20, total: 0 }),
    'POST /api/v1/admin/variants': json({ idVariant: 23 }, { status: 201 }),
    'PUT /api/v1/admin/variants/22': json({ idVariant: 22 }),
    'PUT /api/v1/admin/variants/21': json({ idVariant: 21 }),
  };
  const fake = installFakeApi(routes);
  renderApp('/admin/inventory?category=1&product=7');
  return fake;
};

describe('the stock in units and in packs', () => {
  it('says how many packs of each packaging the shared units make: 54 units are 9 bags of 6 and 4 dozens', async () => {
    await open('Administrator', [dozen(54), bag(54)]);

    expect(
      await screen.findByText('Existencia compartida por sus empaques: 54 unidades'),
    ).toBeDefined();
    const dozenRow = screen.getByText(/PAN-CHA-12/).closest('li') as HTMLElement;
    const bagRow = screen.getByText(/PAN-CHA-06/).closest('li') as HTMLElement;
    expect(within(bagRow).getByText(/9 paquetes de 6 unidades en existencia/)).toBeDefined();
    expect(within(bagRow).getByText(/Trae 6 unidades por paquete/)).toBeDefined();
    expect(within(bagRow).getByText(/9 disponibles para comprar/)).toBeDefined();
    // 54 / 12 = 4,5: cuatro docenas completas y sobran 6 unidades
    expect(within(dozenRow).getByText(/4 paquetes de 12 unidades en existencia/)).toBeDefined();
    expect(within(dozenRow).getByText(/sobran 6 unidades/)).toBeDefined();
  });

  it('counts 8 bags out of 50 units and says that 2 are left over, because the rest is not a whole pack', async () => {
    await open('Administrator', [dozen(50), bag(50)]);

    const bagRow = (await screen.findByText(/PAN-CHA-06/)).closest('li') as HTMLElement;
    expect(within(bagRow).getByText(/8 paquetes de 6 unidades en existencia/)).toBeDefined();
    expect(within(bagRow).getByText(/sobran 2 unidades/)).toBeDefined();
    expect(within(bagRow).getByText(/8 disponibles para comprar/)).toBeDefined();
  });

  it('does not mention leftovers when the packs use every unit', async () => {
    await open('Administrator', [dozen(60), bag(60)]);

    const bagRow = (await screen.findByText(/PAN-CHA-06/)).closest('li') as HTMLElement;
    expect(within(bagRow).getByText(/10 paquetes de 6 unidades en existencia/)).toBeDefined();
    expect(within(bagRow).queryByText(/sobra/)).toBeNull();
  });

  it('keeps the plain wording for a variant that is not packaged', async () => {
    await open('Operator', [
      {
        idVariant: 21,
        sku: 'TL-GRANDE',
        price: '180.00',
        onHandStock: 9,
        available: 7,
        isActive: true,
        attributes: [{ name: 'Tamaño', value: 'Grande' }],
      },
    ]);

    expect(await screen.findByText(/9 unidades en existencia/)).toBeDefined();
    expect(screen.queryByText(/Existencia compartida/)).toBeNull();
    expect(screen.queryByText(/por paquete/)).toBeNull();
  });

  it('explains that the ledger of a shared stock counts units', async () => {
    const user = userEvent.setup();
    await open('Administrator', [dozen(54), bag(54)]);

    const bagRow = (await screen.findByText(/PAN-CHA-06/)).closest('li') as HTMLElement;
    await user.click(within(bagRow).getByRole('button', { name: 'Ver movimientos' }));

    expect(await screen.findByText(/El libro cuenta unidades, no paquetes/)).toBeDefined();
  });
});

describe('who manages the packagings', () => {
  it('asks the catalogue of the administrator, which includes what is no longer sold', async () => {
    const { calls } = await open('Administrator', [dozen(54), bag(54, { isActive: false })]);

    expect(await screen.findByText('Desactivada')).toBeDefined();
    expect(calls.some((call) => call.path === '/api/v1/admin/products/7')).toBe(true);
    expect(calls.some((call) => call.path === '/api/v1/products/7')).toBe(false);
  });

  it('shows the operator the stock but not the buttons that change the catalogue', async () => {
    const { calls } = await open('Operator', [dozen(54), bag(54)]);

    expect(await screen.findByText(/9 paquetes de 6 unidades en existencia/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Agregar empaque' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dejar de vender' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Ver movimientos' })).toHaveLength(2);
    expect(calls.some((call) => call.path === '/api/v1/admin/products/7')).toBe(false);
  });
});

describe('adding a packaging', () => {
  it('creates a variant that draws from the shared stock, with its units, and shows its packs', async () => {
    const user = userEvent.setup();
    // Antes de agregar solo se vende la docena
    const { calls } = await open('Administrator', [dozen(600)]);
    await screen.findByText(/50 paquetes de 12 unidades en existencia/);

    await user.click(screen.getByRole('button', { name: 'Agregar empaque' }));
    const form = screen.getByRole('form', { name: 'Agregar empaque' });
    await user.type(within(form).getByLabelText('Nombre del empaque'), 'Bolsa de 6');
    await user.type(within(form).getByLabelText('Código (SKU)'), 'PAN-CHA-06');
    await user.type(within(form).getByLabelText('Precio'), '19');
    await user.type(within(form).getByLabelText('Unidades por paquete'), '6');
    await user.click(within(form).getByRole('button', { name: 'Agregar empaque' }));

    await waitFor(() => {
      expect(sent(calls, 'POST', '/api/v1/admin/variants')).toHaveLength(1);
    });
    const request = sent(calls, 'POST', '/api/v1/admin/variants')[0];
    expect(request?.body).toEqual({
      productId: 7,
      sku: 'PAN-CHA-06',
      price: '19.00',
      unitsPerPack: 6,
      stockVariantId: 21,
      attributes: [{ name: 'Tamaño', value: 'Bolsa de 6' }],
    });
    expect(request?.headers.get('Idempotency-Key')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole('form', { name: 'Agregar empaque' })).toBeNull();
    });
  });

  it('explains what is missing and sends nothing', async () => {
    const user = userEvent.setup();
    const { calls } = await open('Administrator', [dozen(600)]);
    await screen.findByText(/50 paquetes de 12 unidades en existencia/);

    await user.click(screen.getByRole('button', { name: 'Agregar empaque' }));
    const form = screen.getByRole('form', { name: 'Agregar empaque' });
    await user.click(within(form).getByRole('button', { name: 'Agregar empaque' }));

    expect(await within(form).findByText('Escriba cómo se llama el empaque.')).toBeDefined();
    expect(within(form).getByText('Escriba el código del empaque.')).toBeDefined();
    expect(within(form).getByText(/Escriba un precio mayor que cero/)).toBeDefined();
    expect(within(form).getByText(/un número entero de 1 a 1000/)).toBeDefined();
    expect(sent(calls, 'POST', '/api/v1/admin/variants')).toHaveLength(0);
  });

  it('closes the form without adding anything', async () => {
    const user = userEvent.setup();
    const { calls } = await open('Administrator', [dozen(600)]);
    await screen.findByText(/50 paquetes de 12 unidades en existencia/);
    await user.click(screen.getByRole('button', { name: 'Agregar empaque' }));
    const form = screen.getByRole('form', { name: 'Agregar empaque' });

    await user.click(within(form).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('form', { name: 'Agregar empaque' })).toBeNull();
    expect(sent(calls, 'POST', '/api/v1/admin/variants')).toHaveLength(0);
  });
});

describe('one button to add a packaging for the whole product', () => {
  const small = (extra = {}) => ({
    idVariant: 31,
    sku: 'PAS-CH',
    price: '90.00',
    unitsPerPack: 1,
    idStockHolder: 31,
    onHandStock: 4,
    onHandPacks: 4,
    looseUnits: 0,
    available: 4,
    isActive: true,
    attributes: [{ name: 'Tamaño', value: 'Chico' }],
    ...extra,
  });
  const large = (extra = {}) =>
    small({
      idVariant: 32,
      sku: 'PAS-GR',
      price: '180.00',
      idStockHolder: 32,
      onHandStock: 9,
      onHandPacks: 9,
      available: 9,
      attributes: [{ name: 'Tamaño', value: 'Grande' }],
      ...extra,
    });

  it('shows the button once, below every stock of the product, even with two stocks', async () => {
    await open('Administrator', [small(), large()]);

    await screen.findByText('Chico');
    const buttons = screen.getAllByRole('button', { name: 'Agregar empaque' });
    expect(buttons).toHaveLength(1);
    // Va después de la última variante de la página, no dentro de un grupo
    const lastRow = screen.getByText(/PAS-GR/).closest('li') as HTMLElement;
    expect(
      lastRow.compareDocumentPosition(buttons[0] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(buttons[0]?.closest('div')?.className).toContain('justify-start');
  });

  it('asks which stock the new packaging draws from when the product has several', async () => {
    const user = userEvent.setup();
    const { calls } = await open('Administrator', [small(), large()]);
    await screen.findByText('Chico');

    await user.click(screen.getByRole('button', { name: 'Agregar empaque' }));
    const form = screen.getByRole('form', { name: 'Agregar empaque' });
    const stock = within(form).getByLabelText('Toma las unidades de');
    expect(within(stock).getByRole('option', { name: /Chico · 4 unidades/ })).toBeDefined();
    expect(within(stock).getByRole('option', { name: /Grande · 9 unidades/ })).toBeDefined();

    // Sin elegir no se envía nada
    await user.type(within(form).getByLabelText('Nombre del empaque'), 'Mini');
    await user.type(within(form).getByLabelText('Código (SKU)'), 'PAS-MI');
    await user.type(within(form).getByLabelText('Precio'), '40');
    await user.type(within(form).getByLabelText('Unidades por paquete'), '1');
    await user.click(within(form).getByRole('button', { name: 'Agregar empaque' }));
    expect(
      await within(form).findByText('Elija de qué existencia toma las unidades.'),
    ).toBeDefined();
    expect(sent(calls, 'POST', '/api/v1/admin/variants')).toHaveLength(0);

    await user.selectOptions(stock, 'Grande · 9 unidades en existencia');
    await user.click(within(form).getByRole('button', { name: 'Agregar empaque' }));

    await waitFor(() => {
      expect(sent(calls, 'POST', '/api/v1/admin/variants')).toHaveLength(1);
    });
    expect(sent(calls, 'POST', '/api/v1/admin/variants')[0]?.body).toMatchObject({
      productId: 7,
      sku: 'PAS-MI',
      stockVariantId: 32,
    });
  });

  it('does not ask when the product has one stock: the packaging draws from it', async () => {
    const user = userEvent.setup();
    const { calls } = await open('Administrator', [dozen(600)]);
    await screen.findByText(/50 paquetes de 12 unidades en existencia/);

    await user.click(screen.getByRole('button', { name: 'Agregar empaque' }));
    const form = screen.getByRole('form', { name: 'Agregar empaque' });
    expect(within(form).queryByLabelText('Toma las unidades de')).toBeNull();
    await user.type(within(form).getByLabelText('Nombre del empaque'), 'Bolsa de 6');
    await user.type(within(form).getByLabelText('Código (SKU)'), 'PAN-CHA-06');
    await user.type(within(form).getByLabelText('Precio'), '19');
    await user.type(within(form).getByLabelText('Unidades por paquete'), '6');
    await user.click(within(form).getByRole('button', { name: 'Agregar empaque' }));

    await waitFor(() => {
      expect(sent(calls, 'POST', '/api/v1/admin/variants')).toHaveLength(1);
    });
    expect(sent(calls, 'POST', '/api/v1/admin/variants')[0]?.body).toMatchObject({
      stockVariantId: 21,
    });
  });

  it('does not offer it to the operator', async () => {
    await open('Operator', [small(), large()]);

    await screen.findByText('Chico');
    expect(screen.queryByRole('button', { name: 'Agregar empaque' })).toBeNull();
  });
});

describe('selling one packaging fewer', () => {
  it('asks before it stops selling and keeps the stock where it is', async () => {
    const user = userEvent.setup();
    const { calls } = await open('Administrator', [dozen(54), bag(54)]);
    const bagRow = (await screen.findByText(/PAN-CHA-06/)).closest('li') as HTMLElement;

    await user.click(within(bagRow).getByRole('button', { name: 'Dejar de vender' }));
    expect(within(bagRow).getByText('¿Dejar de vender este empaque?')).toBeDefined();
    expect(sent(calls, 'PUT', '/api/v1/admin/variants/22')).toHaveLength(0);

    await user.click(within(bagRow).getByRole('button', { name: 'Sí, dejar de venderlo' }));

    await waitFor(() => {
      expect(sent(calls, 'PUT', '/api/v1/admin/variants/22')).toHaveLength(1);
    });
    // Se envía lo que la variante ya tenía: el código y su atributo, y solo cambia que ya no se vende
    expect(sent(calls, 'PUT', '/api/v1/admin/variants/22')[0]?.body).toEqual({
      sku: 'PAN-CHA-06',
      isActive: false,
      attributes: [{ name: 'Tamaño', value: 'Bolsa de 6' }],
    });
  });

  it('keeps selling it when the administrator changes their mind', async () => {
    const user = userEvent.setup();
    const { calls } = await open('Administrator', [dozen(54), bag(54)]);
    const bagRow = (await screen.findByText(/PAN-CHA-06/)).closest('li') as HTMLElement;

    await user.click(within(bagRow).getByRole('button', { name: 'Dejar de vender' }));
    await user.click(within(bagRow).getByRole('button', { name: 'No, seguir vendiéndolo' }));

    expect(within(bagRow).queryByText('¿Dejar de vender este empaque?')).toBeNull();
    expect(sent(calls, 'PUT', '/api/v1/admin/variants/22')).toHaveLength(0);
  });

  it('can stop selling the variant that holds the stock: the packagings that draw from it stay', async () => {
    const user = userEvent.setup();
    const { calls } = await open('Administrator', [dozen(54), bag(54)]);
    const dozenRow = (await screen.findByText(/PAN-CHA-12/)).closest('li') as HTMLElement;

    await user.click(within(dozenRow).getByRole('button', { name: 'Dejar de vender' }));
    await user.click(within(dozenRow).getByRole('button', { name: 'Sí, dejar de venderlo' }));

    await waitFor(() => {
      expect(sent(calls, 'PUT', '/api/v1/admin/variants/21')).toHaveLength(1);
    });
    expect(sent(calls, 'PUT', '/api/v1/admin/variants/21')[0]?.body).toMatchObject({
      isActive: false,
    });
    // La bolsa no se toca
    expect(sent(calls, 'PUT', '/api/v1/admin/variants/22')).toHaveLength(0);
  });

  it('sells again a packaging that was stopped', async () => {
    const user = userEvent.setup();
    const { calls } = await open('Administrator', [dozen(54), bag(54, { isActive: false })]);
    const bagRow = (await screen.findByText(/PAN-CHA-06/)).closest('li') as HTMLElement;
    expect(within(bagRow).queryByRole('button', { name: 'Dejar de vender' })).toBeNull();

    await user.click(within(bagRow).getByRole('button', { name: 'Volver a vender' }));

    await waitFor(() => {
      expect(sent(calls, 'PUT', '/api/v1/admin/variants/22')).toHaveLength(1);
    });
    expect(sent(calls, 'PUT', '/api/v1/admin/variants/22')[0]?.body).toMatchObject({
      isActive: true,
    });
  });
});

describe('creating a product whose packagings share one stock', () => {
  it('creates the first variant as the holder, the rest drawing from it, and starts the units once', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let created = false;
    const { calls } = installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': () =>
        json(page(created ? [product(31, 'Champurradas nuevas', '19.00', '35.00')] : [])),
      'POST /api/v1/admin/products': () => {
        created = true;
        return json({ idProduct: 31 }, { status: 201 });
      },
      'POST /api/v1/admin/variants': (call) =>
        json(
          { idVariant: (call.body as { sku: string }).sku === 'CHA-12' ? 71 : 72 },
          { status: 201 },
        ),
      'POST /api/v1/admin/inventory/entries': json({ idMovement: '1' }, { status: 201 }),
      'GET /api/v1/admin/products/31': json({ ...detail([]), idProduct: 31 }),
    });
    renderApp('/admin/inventory?category=1');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });
    await user.type(within(dialog).getByLabelText('Nombre del producto'), 'Champurradas nuevas');
    // Con la opción cambia lo que se pide: unidades por paquete y las unidades con las que empieza, una sola vez
    expect(within(dialog).queryByLabelText('Unidades por paquete')).toBeNull();
    await user.click(
      within(dialog).getByLabelText('Los empaques comparten una sola existencia en unidades'),
    );
    await user.type(within(dialog).getByLabelText(/^Unidades con las que empieza/), '600');

    const first = within(dialog).getByRole('group', { name: 'Variante 1' });
    await user.type(within(first).getByLabelText('Código (SKU)'), 'CHA-12');
    await user.type(within(first).getByLabelText('Precio'), '35');
    await user.type(within(first).getByLabelText('Unidades por paquete'), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar otra variante' }));
    const second = within(dialog).getByRole('group', { name: 'Variante 2' });
    await user.type(within(second).getByLabelText('Código (SKU)'), 'CHA-06');
    await user.type(within(second).getByLabelText('Precio'), '19');
    await user.type(within(second).getByLabelText('Unidades por paquete'), '6');
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent(calls, 'POST', '/api/v1/admin/variants').map((call) => call.body)).toEqual([
      expect.objectContaining({
        productId: 31,
        sku: 'CHA-12',
        unitsPerPack: 12,
        stockVariantId: null,
      }),
      expect.objectContaining({
        productId: 31,
        sku: 'CHA-06',
        unitsPerPack: 6,
        stockVariantId: 71,
      }),
    ]);
    // Las 600 unidades entran una sola vez, a la variante que guarda la existencia
    expect(sent(calls, 'POST', '/api/v1/admin/inventory/entries').map((call) => call.body)).toEqual(
      [{ idVariant: 71, quantity: 600, reason: 'Stock inicial al crear el producto' }],
    );
  });

  it('asks for the units of every packaging when the stock is shared', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([])),
    });
    renderApp('/admin/inventory?category=1');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });
    await user.type(within(dialog).getByLabelText('Nombre del producto'), 'Champurradas nuevas');
    await user.click(
      within(dialog).getByLabelText('Los empaques comparten una sola existencia en unidades'),
    );
    const first = within(dialog).getByRole('group', { name: 'Variante 1' });
    await user.type(within(first).getByLabelText('Código (SKU)'), 'CHA-12');
    await user.type(within(first).getByLabelText('Precio'), '35');
    await user.clear(within(first).getByLabelText('Unidades por paquete'));

    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    expect(await within(dialog).findByText(/un número entero de 1 a 1000/)).toBeDefined();
    expect(sent(calls, 'POST', '/api/v1/admin/products')).toHaveLength(0);
  });
});
