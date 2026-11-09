// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
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

// Las categorías llegan desordenadas: la pantalla las ordena
const tree = () => [
  { ...category(3, 'Tartas'), children: [{ ...category(5, 'Frutales'), children: [] }] },
  category(1, 'Panes'),
  category(2, 'Bebidas'),
];

const variant = (extra = {}) => ({
  idVariant: 21,
  sku: 'TL-GRANDE',
  price: '180.00',
  onHandStock: 9,
  available: 7,
  isActive: true,
  attributes: [{ name: 'Tamaño', value: 'Grande' }],
  ...extra,
});

const detail = (variants: unknown[] = [variant()]) => ({
  ...product(7, 'Pastel tres leches', '90.00', '180.00'),
  images: [],
  variants,
});

const movement = (extra = {}) => ({
  idInventoryMovement: '90',
  movementType: 'Entry',
  quantity: 12,
  resultingBalance: 12,
  reason: 'Llegó el pedido del proveedor',
  idUser: 1,
  userName: 'Ana Pérez',
  idOrder: null,
  createdAt: '2030-06-01T15:00:00Z',
  ...extra,
});

const ledgerPage = (items: unknown[], total = items.length) => ({
  items,
  page: 1,
  size: 20,
  total,
});

const sent = (calls: Call[], path: string) =>
  calls.filter((call) => call.method === 'POST' && call.path === path);

const tresLeches = () => product(7, 'Pastel tres leches', '90.00', '180.00');

describe('choosing the category', () => {
  it('lists the categories alphabetically, the ones below another under it', async () => {
    await signInAs('Operator');
    installFakeApi({ 'GET /api/v1/categories': json(tree()) });
    renderApp('/admin/inventory');

    expect(await screen.findByText('Elija una categoría para ver sus productos.')).toBeDefined();
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(5);
    });
    const names = screen.getAllByRole('option').map((option) => option.textContent.trim());
    expect(names).toEqual(['Elija una categoría', 'Bebidas', 'Panes', 'Tartas', '↳ Frutales']);
  });

  it('shows the products of the chosen category and asks the server for them by name', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([tresLeches()])),
    });
    renderApp('/admin/inventory');
    await screen.findByRole('option', { name: 'Panes' });

    await user.selectOptions(screen.getByLabelText('Categoría'), 'Panes');

    expect(await screen.findByText('Pastel tres leches')).toBeDefined();
    expect(screen.getByText(/20 disponibles para comprar/)).toBeDefined();
    const query = new URLSearchParams(
      calls.filter((call) => call.path === '/api/v1/products').at(-1)?.search,
    );
    expect(query.get('category')).toBe('1');
    expect(query.get('sort')).toBe('name');
    expect(screen.getByText('1 producto')).toBeDefined();
  });

  it('says so when the category has no products', async () => {
    await signInAs('Operator');
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([])),
    });
    renderApp('/admin/inventory?category=2');

    expect(await screen.findByText('Esta categoría aún no tiene productos')).toBeDefined();
  });

  it('marks the products made to order', async () => {
    await signInAs('Operator');
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(
        page([product(8, 'Pastel de boda', '500.00', '900.00', { leadTimeDays: 3 })]),
      ),
    });
    renderApp('/admin/inventory?category=1');

    expect(await screen.findByText('Por encargo: 3 días')).toBeDefined();
  });

  it('shows the error of the server and lets it retry', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': () => {
        if (failing) return apiError(500, 'INTERNAL_ERROR');
        return json(page([tresLeches()]));
      },
    });
    renderApp('/admin/inventory?category=1');

    await screen.findByRole('button', { name: 'Reintentar' });
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Pastel tres leches')).toBeDefined();
  });
});

describe('managing the inventory of a product', () => {
  it('opens the variants of the product with what is on hand and what can be bought', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([tresLeches()])),
      'GET /api/v1/products/7': json(detail()),
    });
    renderApp('/admin/inventory?category=1');

    await user.click(await screen.findByRole('button', { name: 'Gestionar inventario' }));

    expect(await screen.findByText('Grande')).toBeDefined();
    expect(screen.getByText(/TL-GRANDE/)).toBeDefined();
    expect(screen.getByText(/9 unidades en existencia/)).toBeDefined();
    expect(screen.getByText(/7 disponibles para comprar/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cerrar' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('closes the product again', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([tresLeches()])),
      'GET /api/v1/products/7': json(detail()),
    });
    renderApp('/admin/inventory?category=1&product=7');
    await screen.findByText('Grande');

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => {
      expect(screen.queryByText('Grande')).toBeNull();
    });
  });
});

describe('the ledger of a variant', () => {
  const open = async (movements: unknown[] = [movement()], total = movements.length) => {
    await signInAs('Operator');
    const fake = installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([tresLeches()])),
      'GET /api/v1/products/7': json(detail()),
      'GET /api/v1/admin/inventory/ledger': json(ledgerPage(movements, total)),
      'POST /api/v1/admin/inventory/entries': json({ idMovement: '91' }, { status: 201 }),
      'POST /api/v1/admin/inventory/adjustments': json({ idMovement: '92' }, { status: 201 }),
    });
    renderApp('/admin/inventory?category=1&product=7&variant=21');
    return fake;
  };

  it('lists the movements with type, units, balance, reason, who and when', async () => {
    await open([
      movement(),
      movement({
        idInventoryMovement: '89',
        movementType: 'Exit',
        quantity: -2,
        resultingBalance: 10,
        reason: undefined,
        userName: null,
        idOrder: 5,
      }),
    ]);

    expect(await screen.findByText('Movimientos de Grande')).toBeDefined();
    expect(await screen.findByText('Entrada')).toBeDefined();
    expect(screen.getByText('+12 unidades')).toBeDefined();
    expect(screen.getByText('Llegó el pedido del proveedor')).toBeDefined();
    expect(screen.getByText(/Por Ana Pérez/)).toBeDefined();
    expect(screen.getByText('Salida')).toBeDefined();
    expect(screen.getByText('-2 unidades')).toBeDefined();
    expect(screen.getByText(/Lo hizo el sistema · pedido 5/)).toBeDefined();
    expect(screen.getByText('2 movimientos')).toBeDefined();
  });

  it('asks the server for the variant and pages on the server', async () => {
    const user = userEvent.setup();
    const { calls } = await open([movement()], 45);
    expect(await screen.findByText('Página 1 de 3')).toBeDefined();
    const query = new URLSearchParams(
      calls.filter((call) => call.path === '/api/v1/admin/inventory/ledger').at(-1)?.search,
    );
    expect(query.get('variant')).toBe('21');
    expect(query.get('size')).toBe('20');

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      const last = calls.filter((call) => call.path === '/api/v1/admin/inventory/ledger').at(-1);
      expect(new URLSearchParams(last?.search).get('page')).toBe('2');
    });
  });

  it('opens the ledger of a variant from the list', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([tresLeches()])),
      'GET /api/v1/products/7': json(detail()),
      'GET /api/v1/admin/inventory/ledger': json(ledgerPage([movement()])),
    });
    renderApp('/admin/inventory?category=1&product=7');

    await user.click(await screen.findByRole('button', { name: 'Ver movimientos' }));

    expect(await screen.findByText('Movimientos de Grande')).toBeDefined();
    expect(calls.some((call) => call.path === '/api/v1/admin/inventory/ledger')).toBe(true);
  });

  it('says so when the variant has no movements yet', async () => {
    await open([]);

    expect(await screen.findByText('Esta variante aún no tiene movimientos')).toBeDefined();
  });

  it('registers an entry with its reason and an idempotency key', async () => {
    const user = userEvent.setup();
    const { calls } = await open();
    const form = await screen.findByRole('form', { name: 'Registrar entrada' });

    await user.type(within(form).getByLabelText('Unidades que llegaron'), '12');
    await user.type(within(form).getByLabelText('Motivo'), 'Llegó el pedido');
    await user.click(within(form).getByRole('button', { name: 'Registrar entrada' }));

    expect(await within(form).findByText('Movimiento registrado.')).toBeDefined();
    const call = sent(calls, '/api/v1/admin/inventory/entries')[0];
    expect(call?.body).toEqual({ idVariant: 21, quantity: 12, reason: 'Llegó el pedido' });
    expect(call?.headers.get('Idempotency-Key')).toBeTruthy();
    expect(within(form).getByLabelText<HTMLInputElement>('Motivo').value).toBe('');
  });

  it('adjusts the stock to the counted value, even zero', async () => {
    const user = userEvent.setup();
    const { calls } = await open();
    const form = await screen.findByRole('form', { name: 'Ajustar por conteo' });

    await user.type(within(form).getByLabelText('Unidades contadas'), '0');
    await user.type(within(form).getByLabelText('Motivo'), 'Se echó a perder');
    await user.click(within(form).getByRole('button', { name: 'Ajustar stock' }));

    await waitFor(() => {
      expect(sent(calls, '/api/v1/admin/inventory/adjustments')).toHaveLength(1);
    });
    expect(sent(calls, '/api/v1/admin/inventory/adjustments')[0]?.body).toEqual({
      idVariant: 21,
      newOnHand: 0,
      reason: 'Se echó a perder',
    });
  });

  it('does not send a movement without a reason or with a wrong number', async () => {
    const user = userEvent.setup();
    const { calls } = await open();
    const form = await screen.findByRole('form', { name: 'Registrar entrada' });

    await user.type(within(form).getByLabelText('Unidades que llegaron'), '0');
    await user.click(within(form).getByRole('button', { name: 'Registrar entrada' }));

    expect(await within(form).findByText('Escriba un número entero mayor que cero.')).toBeDefined();
    expect(within(form).getByText('Explique el motivo: queda anotado en el libro.')).toBeDefined();
    expect(sent(calls, '/api/v1/admin/inventory/entries')).toHaveLength(0);
  });

  it('says when the stock already had the counted value', async () => {
    const user = userEvent.setup();
    await signInAs('Operator');
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([tresLeches()])),
      'GET /api/v1/products/7': json(detail()),
      'GET /api/v1/admin/inventory/ledger': json(ledgerPage([])),
      'POST /api/v1/admin/inventory/adjustments': json({ idMovement: null }, { status: 201 }),
    });
    renderApp('/admin/inventory?category=1&product=7&variant=21');
    const form = await screen.findByRole('form', { name: 'Ajustar por conteo' });

    await user.type(within(form).getByLabelText('Unidades contadas'), '9');
    await user.type(within(form).getByLabelText('Motivo'), 'Conteo del lunes');
    await user.click(within(form).getByRole('button', { name: 'Ajustar stock' }));

    expect(
      await within(form).findByText('El stock ya tenía ese valor: no se anotó nada.'),
    ).toBeDefined();
  });

  it('shows the reason when the server refuses the movement', async () => {
    const user = userEvent.setup();
    await signInAs('Operator');
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([tresLeches()])),
      'GET /api/v1/products/7': json(detail()),
      'GET /api/v1/admin/inventory/ledger': json(ledgerPage([])),
      'POST /api/v1/admin/inventory/entries': apiError(422, 'UNPROCESSABLE'),
    });
    renderApp('/admin/inventory?category=1&product=7&variant=21');
    const form = await screen.findByRole('form', { name: 'Registrar entrada' });

    await user.type(within(form).getByLabelText('Unidades que llegaron'), '5');
    await user.type(within(form).getByLabelText('Motivo'), 'Llegada');
    await user.click(within(form).getByRole('button', { name: 'Registrar entrada' }));

    expect(await within(form).findByRole('alert')).toBeDefined();
  });
});

describe('creating a product', () => {
  const setup = async () => {
    await signInAs('Administrator');
    // Tras crearlo, la lista de la categoría ya trae el producto nuevo
    let created = false;
    return installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': () =>
        json(page(created ? [product(31, 'Pastel de zanahoria', '95.00')] : [])),
      'POST /api/v1/admin/products': () => {
        created = true;
        return json({ idProduct: 31 }, { status: 201 });
      },
      'POST /api/v1/admin/variants': json({ idVariant: 71 }, { status: 201 }),
      'POST /api/v1/admin/inventory/entries': json({ idMovement: '1' }, { status: 201 }),
      'GET /api/v1/products/31': json({
        ...detail([]),
        idProduct: 31,
        name: 'Pastel de zanahoria',
      }),
    });
  };

  const fill = async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
    await user.selectOptions(within(dialog).getByLabelText('Categoría'), 'Panes');
    await user.type(within(dialog).getByLabelText('Nombre del producto'), 'Pastel de zanahoria');
    const variantBox = within(dialog).getByRole('group', { name: 'Variante 1' });
    await user.type(within(variantBox).getByLabelText('Código (SKU)'), 'ZAN-M');
    await user.type(within(variantBox).getByLabelText('Precio'), '95');
  };

  it('is offered to the administrator and not to the operator', async () => {
    await signInAs('Operator');
    installFakeApi({ 'GET /api/v1/categories': json(tree()) });
    const operator = renderApp('/admin/inventory');
    await screen.findByLabelText('Categoría');
    expect(screen.queryByRole('button', { name: 'Crear producto' })).toBeNull();
    operator.unmount();
    cleanup();
    await resetSession();

    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/categories': json(tree()) });
    renderApp('/admin/inventory');
    expect(await screen.findByRole('button', { name: 'Crear producto' })).toBeDefined();
  });

  it('opens a window with the open category already chosen and one empty variant', async () => {
    await setup();
    const user = userEvent.setup();
    renderApp('/admin/inventory?category=1');

    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));

    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });
    expect(within(dialog).getByLabelText<HTMLSelectElement>('Categoría').value).toBe('1');
    expect(within(dialog).getAllByRole('group', { name: /^Variante/ })).toHaveLength(1);
    expect(within(dialog).getByText(/Con 0 días se vende de inmediato/)).toBeDefined();
  });

  it('closes without creating anything', async () => {
    const { calls } = await setup();
    const user = userEvent.setup();
    renderApp('/admin/inventory');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent(calls, '/api/v1/admin/products')).toHaveLength(0);
  });

  it('explains what is missing and sends nothing', async () => {
    const { calls } = await setup();
    const user = userEvent.setup();
    renderApp('/admin/inventory');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });

    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    expect(
      await within(dialog).findByText('Elija una categoría.', { selector: 'p' }),
    ).toBeDefined();
    expect(within(dialog).getByText('Escriba el nombre del producto.')).toBeDefined();
    expect(within(dialog).getByText('Escriba el código de la variante.')).toBeDefined();
    expect(within(dialog).getByText(/Escriba un precio mayor que cero/)).toBeDefined();
    expect(sent(calls, '/api/v1/admin/products')).toHaveLength(0);
  });

  it('says that the product is made to order when it has preparation days', async () => {
    await setup();
    const user = userEvent.setup();
    renderApp('/admin/inventory');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });

    await user.clear(within(dialog).getByLabelText('Días de preparación'));
    await user.type(within(dialog).getByLabelText('Días de preparación'), '3');

    expect(
      within(dialog).getByText('Se prepara por encargo: el cliente lo recibe 3 días después.'),
    ).toBeDefined();
  });

  it('adds and removes variants, never leaving fewer than one', async () => {
    await setup();
    const user = userEvent.setup();
    renderApp('/admin/inventory');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });
    expect(within(dialog).queryByRole('button', { name: 'Quitar esta variante' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Agregar otra variante' }));
    expect(within(dialog).getAllByRole('group', { name: /^Variante/ })).toHaveLength(2);

    const [removeFirst] = within(dialog).getAllByRole('button', { name: 'Quitar esta variante' });
    await user.click(removeFirst as HTMLElement);
    expect(within(dialog).getAllByRole('group', { name: /^Variante/ })).toHaveLength(1);
    expect(within(dialog).queryByRole('button', { name: 'Quitar esta variante' })).toBeNull();
  });

  it('refuses a code that repeats in two variants', async () => {
    const { calls } = await setup();
    const user = userEvent.setup();
    renderApp('/admin/inventory');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });
    await fill(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Agregar otra variante' }));
    const second = within(dialog).getByRole('group', { name: 'Variante 2' });
    await user.type(within(second).getByLabelText('Código (SKU)'), 'zan-m');
    await user.type(within(second).getByLabelText('Precio'), '120');

    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    expect(
      await within(dialog).findByText('Este código se repite en otra variante.'),
    ).toBeDefined();
    expect(sent(calls, '/api/v1/admin/products')).toHaveLength(0);
  });

  it('creates the product, its variants and their starting stock, then opens it', async () => {
    const { calls } = await setup();
    const user = userEvent.setup();
    renderApp('/admin/inventory');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });
    await fill(user, dialog);
    await user.type(within(dialog).getByLabelText(/^Descripción/), 'Con nueces');
    const first = within(dialog).getByRole('group', { name: 'Variante 1' });
    await user.type(within(first).getByLabelText(/^Atributo/), 'Tamaño');
    await user.type(within(first).getByLabelText(/^Valor del atributo/), 'Mediano');
    await user.type(within(first).getByLabelText(/^Unidades con las que empieza/), '6');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar otra variante' }));
    const second = within(dialog).getByRole('group', { name: 'Variante 2' });
    await user.type(within(second).getByLabelText('Código (SKU)'), 'ZAN-G');
    await user.type(within(second).getByLabelText('Precio'), '150.5');

    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const product = sent(calls, '/api/v1/admin/products')[0];
    expect(product?.body).toEqual({
      categoryId: 1,
      name: 'Pastel de zanahoria',
      description: 'Con nueces',
      leadTimeDays: 0,
    });
    expect(product?.headers.get('Idempotency-Key')).toBeTruthy();
    const variants = sent(calls, '/api/v1/admin/variants');
    expect(variants.map((call) => call.body)).toEqual([
      {
        productId: 31,
        sku: 'ZAN-M',
        price: '95.00',
        attributes: [{ name: 'Tamaño', value: 'Mediano' }],
      },
      { productId: 31, sku: 'ZAN-G', price: '150.50' },
    ]);
    // Solo la primera variante pidió stock inicial, y lleva su motivo
    const entries = sent(calls, '/api/v1/admin/inventory/entries');
    expect(entries.map((call) => call.body)).toEqual([
      { idVariant: 71, quantity: 6, reason: 'Stock inicial al crear el producto' },
    ]);
    // El producto nuevo queda abierto en su categoría
    expect(await screen.findByRole('heading', { name: 'Pastel de zanahoria' })).toBeDefined();
  });

  it('keeps what was created when a step fails and finishes from there on retry', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    let variantCalls = 0;
    const { calls } = installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([])),
      'POST /api/v1/admin/products': json({ idProduct: 31 }, { status: 201 }),
      'POST /api/v1/admin/variants': () => {
        variantCalls += 1;
        // El primer intento falla con un código repetido; el segundo lo logra
        return variantCalls === 1
          ? apiError(409, 'CONFLICT')
          : json({ idVariant: 71 }, { status: 201 });
      },
      'GET /api/v1/products/31': json({ ...detail([]), idProduct: 31 }),
    });
    renderApp('/admin/inventory');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });
    await fill(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    expect(await within(dialog).findByRole('alert')).toBeDefined();
    expect(within(dialog).getByText(/El producto ya se creó/)).toBeDefined();
    // Lo creado ya no se puede cambiar: el reintento solo termina lo que falta
    expect(within(dialog).getByLabelText('Nombre del producto').closest('fieldset')?.disabled).toBe(
      true,
    );

    await user.click(within(dialog).getByRole('button', { name: 'Terminar de crear' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // El producto se creó una sola vez; la variante se intentó dos veces
    expect(sent(calls, '/api/v1/admin/products')).toHaveLength(1);
    expect(sent(calls, '/api/v1/admin/variants')).toHaveLength(2);
  });

  it('shows the reason when the server refuses the product', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/categories': json(tree()),
      'GET /api/v1/products': json(page([])),
      'POST /api/v1/admin/products': apiError(422, 'UNPROCESSABLE'),
    });
    renderApp('/admin/inventory');
    await user.click(await screen.findByRole('button', { name: 'Crear producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear producto' });
    await fill(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    expect(await within(dialog).findByRole('alert')).toBeDefined();
    // Nada se creó: el formulario sigue editable y no se habla de un producto a medias
    expect(within(dialog).queryByText(/El producto ya se creó/)).toBeNull();
  });
});

describe('who can open the inventory', () => {
  it('offers it in the menu to both staff roles', async () => {
    await signInAs('Administrator');
    installFakeApi({ 'GET /api/v1/categories': json(tree()) });
    const administrator = renderApp('/admin/inventory');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Inventario' })).toBeDefined();
    administrator.unmount();
    cleanup();
    await resetSession();

    await signInAs('Operator');
    installFakeApi({ 'GET /api/v1/categories': json(tree()) });
    renderApp('/admin/inventory');
    const operatorHeader = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(operatorHeader).getByRole('link', { name: 'Inventario' })).toBeDefined();
    expect(await screen.findByRole('heading', { level: 1, name: 'Inventario' })).toBeDefined();
  });

  it('keeps it away from the customer', async () => {
    await signInAs('Customer');
    const { calls } = installFakeApi({});
    renderApp('/admin/inventory');

    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
    expect(calls.some((call) => call.path.includes('/inventory'))).toBe(false);
  });
});
