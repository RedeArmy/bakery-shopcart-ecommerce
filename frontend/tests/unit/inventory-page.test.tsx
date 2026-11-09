// cspell:disable
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import type { Call } from './support/fake-api';
import { page, product, renderApp, resetSession, signInAs } from './support/render';

beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

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
  calls.find((call) => call.method === 'POST' && call.path === path);

describe('choosing the variant', () => {
  it('asks for a product first and searches by name', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/products': json(page([product(7, 'Pastel tres leches', '90.00', '180.00')])),
    });
    renderApp('/admin/inventory');

    expect(await screen.findByText('Escriba el nombre de un producto para empezar.')).toBeDefined();
    await user.type(screen.getByLabelText('Buscar producto'), 'leches');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Pastel tres leches')).toBeDefined();
    const search = calls.filter((call) => call.path === '/api/v1/products').at(-1)?.search;
    expect(new URLSearchParams(search).get('q')).toBe('leches');
  });

  it('says so when no product matches', async () => {
    await signInAs('Operator');
    installFakeApi({ 'GET /api/v1/products': json(page([])) });
    renderApp('/admin/inventory?q=nada');

    expect(await screen.findByText('No hay productos con ese nombre')).toBeDefined();
  });

  it('lists the variants of the chosen product with what is on hand and what can be bought', async () => {
    await signInAs('Operator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/products': json(page([product(7, 'Pastel tres leches', '90.00', '180.00')])),
      'GET /api/v1/products/7': json(detail()),
    });
    renderApp('/admin/inventory?q=leches');

    await user.click(await screen.findByRole('button', { name: 'Elegir' }));

    expect(await screen.findByRole('heading', { name: 'Pastel tres leches' })).toBeDefined();
    const item = (await screen.findAllByRole('listitem'))[0] as HTMLElement;
    expect(within(item).getByText('Grande')).toBeDefined();
    expect(within(item).getByText(/TL-GRANDE/)).toBeDefined();
    expect(within(item).getByText(/9 unidades en existencia/)).toBeDefined();
    expect(within(item).getByText(/7 disponibles para comprar/)).toBeDefined();
  });
});

describe('the ledger of a variant', () => {
  const open = async (movements: unknown[] = [movement()], total = movements.length) => {
    await signInAs('Operator');
    const fake = installFakeApi({
      'GET /api/v1/products/7': json(detail()),
      'GET /api/v1/admin/inventory/ledger': json(ledgerPage(movements, total)),
      'POST /api/v1/admin/inventory/entries': json({ idMovement: '91' }, { status: 201 }),
      'POST /api/v1/admin/inventory/adjustments': json({ idMovement: '92' }, { status: 201 }),
    });
    renderApp('/admin/inventory?product=7&variant=21');
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
    const items = await screen.findAllByText(/unidades$/);
    expect(items.length).toBeGreaterThan(0);
    expect(screen.getByText('Entrada')).toBeDefined();
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
    const call = sent(calls, '/api/v1/admin/inventory/entries');
    expect(call?.body).toEqual({ idVariant: 21, quantity: 12, reason: 'Llegó el pedido' });
    expect(call?.headers.get('Idempotency-Key')).toBeTruthy();
    // El formulario queda limpio para el siguiente movimiento
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
      expect(sent(calls, '/api/v1/admin/inventory/adjustments')).toBeDefined();
    });
    expect(sent(calls, '/api/v1/admin/inventory/adjustments')?.body).toEqual({
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
    expect(sent(calls, '/api/v1/admin/inventory/entries')).toBeUndefined();
  });

  it('says when the stock already had the counted value', async () => {
    const user = userEvent.setup();
    await signInAs('Operator');
    installFakeApi({
      'GET /api/v1/products/7': json(detail()),
      'GET /api/v1/admin/inventory/ledger': json(ledgerPage([])),
      'POST /api/v1/admin/inventory/adjustments': json({ idMovement: null }, { status: 201 }),
    });
    renderApp('/admin/inventory?product=7&variant=21');
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
      'GET /api/v1/products/7': json(detail()),
      'GET /api/v1/admin/inventory/ledger': json(ledgerPage([])),
      'POST /api/v1/admin/inventory/entries': apiError(422, 'UNPROCESSABLE'),
    });
    renderApp('/admin/inventory?product=7&variant=21');
    const form = await screen.findByRole('form', { name: 'Registrar entrada' });

    await user.type(within(form).getByLabelText('Unidades que llegaron'), '5');
    await user.type(within(form).getByLabelText('Motivo'), 'Llegada');
    await user.click(within(form).getByRole('button', { name: 'Registrar entrada' }));

    expect(await within(form).findByRole('alert')).toBeDefined();
  });

  it('shows the error of the ledger and lets it retry', async () => {
    const user = userEvent.setup();
    await signInAs('Operator');
    let failing = true;
    installFakeApi({
      'GET /api/v1/products/7': json(detail()),
      'GET /api/v1/admin/inventory/ledger': () => {
        if (failing) return apiError(500, 'INTERNAL_ERROR');
        return json(ledgerPage([movement()]));
      },
    });
    renderApp('/admin/inventory?product=7&variant=21');

    await screen.findByText('Movimientos de Grande');
    await screen.findByRole('button', { name: 'Reintentar' });
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Llegó el pedido del proveedor')).toBeDefined();
  });
});

describe('who can open the inventory', () => {
  it('lets the administrator in and offers it in the menu to both staff roles', async () => {
    await signInAs('Administrator');
    installFakeApi({});
    const administrator = renderApp('/admin/inventory');
    const header = (await screen.findAllByRole('banner'))[0] as HTMLElement;
    expect(within(header).getByRole('link', { name: 'Inventario' })).toBeDefined();
    administrator.unmount();
    cleanup();
    await resetSession();

    await signInAs('Operator');
    installFakeApi({});
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
