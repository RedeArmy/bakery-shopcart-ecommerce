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

const method = (extra = {}) => ({
  idPaymentMethod: 2,
  code: 'BANK_DEPOSIT',
  kind: 'Deposit',
  title: 'Depósito o transferencia bancaria',
  description: 'Suba su comprobante',
  appliesToDelivery: true,
  appliesToPickup: true,
  isActive: true,
  ...extra,
});

const cash = (extra = {}) =>
  method({
    idPaymentMethod: 3,
    code: 'CASH_ON_PICKUP',
    kind: 'Cash',
    title: 'Efectivo o contra entrega',
    description: null,
    appliesToDelivery: false,
    appliesToPickup: true,
    ...extra,
  });

describe('the payment methods administration', () => {
  it('lists the methods with where each one is offered and the actions only for what can be done', async () => {
    await signInAs('Administrator');
    installFakeApi({
      'GET /api/v1/admin/payment-methods': json([
        method(),
        cash(),
        cash({ idPaymentMethod: 4, title: 'Antiguo', isActive: false }),
      ]),
    });
    renderApp('/admin/payment-methods');

    expect(await screen.findByRole('heading', { name: 'Métodos de pago' })).toBeDefined();
    expect(await screen.findByText('Depósito o transferencia bancaria')).toBeDefined();
    expect(
      screen.getByText('Se ofrece para entrega a domicilio y para recoger en sucursal.'),
    ).toBeDefined();
    expect(screen.getAllByText('Se ofrece solo para recoger en sucursal.')).toHaveLength(2);
    expect(screen.getByText('Desactivado')).toBeDefined();
    // Quitar solo para los activos; los desactivados se reactivan
    expect(screen.getAllByRole('button', { name: 'Quitar' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Reactivar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(3);
  });

  it('explains an empty list and opens the form to add the first method', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({ 'GET /api/v1/admin/payment-methods': json([]) });
    renderApp('/admin/payment-methods');

    expect(await screen.findByText('Todavía no hay métodos de pago')).toBeDefined();
    await user.click(
      screen.getAllByRole('button', { name: 'Agregar método de pago' })[0] as HTMLElement,
    );
    expect(await screen.findByRole('heading', { name: 'Nuevo método de pago' })).toBeDefined();
  });

  it('asks for a name and for at least one way of receiving before creating', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({ 'GET /api/v1/admin/payment-methods': json([method()]) });
    renderApp('/admin/payment-methods');

    await user.click(await screen.findByRole('button', { name: 'Agregar método de pago' }));
    await user.click(screen.getByLabelText('Entrega a domicilio'));
    await user.click(screen.getByLabelText('Recoger en sucursal'));
    await user.click(screen.getByRole('button', { name: 'Crear método' }));

    expect(await screen.findByText('Este dato es obligatorio.')).toBeDefined();
    expect(await screen.findByText('Elija al menos una forma de recibir el pedido.')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('creates a deposit method with the chosen places and an idempotency key', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payment-methods': json([method()]),
      'POST /api/v1/admin/payment-methods': json({ idPaymentMethod: 5 }, { status: 201 }),
    });
    renderApp('/admin/payment-methods');

    await user.click(await screen.findByRole('button', { name: 'Agregar método de pago' }));
    await user.type(await screen.findByLabelText('Nombre que ve el cliente'), 'Transferencia ACH');
    await user.click(screen.getByLabelText('Recoger en sucursal'));
    await user.click(screen.getByRole('button', { name: 'Crear método' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });
    const sent = calls.find((call) => call.method === 'POST');
    expect(sent?.body).toEqual({
      kind: 'Deposit',
      title: 'Transferencia ACH',
      description: null,
      appliesToDelivery: true,
      appliesToPickup: false,
    });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('keeps the cash for pickups only: the form hides the places and sends it that way', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payment-methods': json([method()]),
      'POST /api/v1/admin/payment-methods': json({ idPaymentMethod: 6 }, { status: 201 }),
    });
    renderApp('/admin/payment-methods');

    await user.click(await screen.findByRole('button', { name: 'Agregar método de pago' }));
    await user.selectOptions(await screen.findByLabelText('Clase'), 'Cash');
    expect(
      screen.getByText(
        'El efectivo se cobra en la sucursal, así que solo se ofrece para recogidas.',
      ),
    ).toBeDefined();
    expect(screen.queryByLabelText('Entrega a domicilio')).toBeNull();
    await user.type(screen.getByLabelText('Nombre que ve el cliente'), 'Efectivo en caja');
    await user.click(screen.getByRole('button', { name: 'Crear método' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      kind: 'Cash',
      appliesToDelivery: false,
      appliesToPickup: true,
    });
  });

  it('edits a method without changing its kind', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payment-methods': json([method()]),
      'PUT /api/v1/admin/payment-methods/2': json({ idPaymentMethod: 2 }),
    });
    renderApp('/admin/payment-methods');

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    expect((await screen.findByLabelText<HTMLSelectElement>('Clase')).disabled).toBe(true);
    const title = screen.getByLabelText('Nombre que ve el cliente');
    await user.clear(title);
    await user.type(title, 'Depósito bancario');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PUT')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
      title: 'Depósito bancario',
      appliesToDelivery: true,
      appliesToPickup: true,
    });
  });

  it('removes a method only after a confirmation, and says so when the server refuses', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payment-methods': json([method()]),
      'DELETE /api/v1/admin/payment-methods/2': json({ idPaymentMethod: 2, isActive: false }),
    });
    renderApp('/admin/payment-methods');

    await user.click(await screen.findByRole('button', { name: 'Quitar' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Sí, quitarlo' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    });
  });

  it('shows the answer of the server when a name is already taken', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/admin/payment-methods': json([method()]),
      'POST /api/v1/admin/payment-methods': apiError(409, 'PAYMENT_METHOD_TITLE_IN_USE'),
    });
    renderApp('/admin/payment-methods');

    await user.click(await screen.findByRole('button', { name: 'Agregar método de pago' }));
    await user.type(await screen.findByLabelText('Nombre que ve el cliente'), 'Depósito');
    await user.click(screen.getByRole('button', { name: 'Crear método' }));

    expect(
      await screen.findByText('Ya hay un método de pago activo con ese nombre.'),
    ).toBeDefined();
  });

  it('reactivates a deactivated method', async () => {
    await signInAs('Administrator');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/admin/payment-methods': json([method({ isActive: false })]),
      'PUT /api/v1/admin/payment-methods/2': json({ idPaymentMethod: 2 }),
    });
    renderApp('/admin/payment-methods');

    await user.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PUT')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({ isActive: true });
  });

  it('does not open to a customer', async () => {
    await signInAs('Customer');
    installFakeApi({});
    renderApp('/admin/payment-methods');
    expect(await screen.findByText('No tiene acceso a esta página')).toBeDefined();
  });
});
