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

const home = {
  'GET /api/v1/categories': json([]),
  'GET /api/v1/products': json({ items: [], page: 1, size: 4, total: 0 }),
};

const tracking = (extra = {}) => ({
  orderNumber: 'PED-2026-000123',
  statusName: 'PendingPayment',
  createdAt: '2026-11-06T15:00:00Z',
  requestedDeliveryDate: '2030-06-10',
  fulfilmentType: 'Pickup',
  pickupBranchName: 'Sucursal Centro',
  history: [
    { idNewStatus: 1, newStatusName: 'PendingPayment', createdAt: '2026-11-06T15:00:00Z' },
    { idNewStatus: 2, newStatusName: 'Paid', createdAt: '2026-11-07T10:00:00Z' },
  ],
  ...extra,
});

const fill = async (user: ReturnType<typeof userEvent.setup>, number: string, email: string) => {
  await user.type(await screen.findByLabelText('Número de pedido'), number);
  await user.type(screen.getByLabelText('Correo del pedido'), email);
  await user.click(screen.getByRole('button', { name: 'Consultar' }));
};

describe('following an order from the home page', () => {
  it('shows its status, its dates and its history to a visitor, with no session', async () => {
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      ...home,
      'GET /api/v1/orders/track': json(tracking()),
    });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Consulte su pedido' })).toBeDefined();
    await fill(user, 'PED-2026-000123', 'ana@shopcart.test');

    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000123' })).toBeDefined();
    expect(screen.getByText('Para recoger en Sucursal Centro')).toBeDefined();
    expect(screen.getAllByText('Pagado').length).toBeGreaterThan(0);
    // Sin sesión: la consulta no lleva credenciales, solo el número y el correo
    const sent = calls.find((call) => call.path === '/api/v1/orders/track');
    expect(sent?.headers.get('Authorization')).toBeNull();
    expect(sent?.search).toContain('orderNumber=PED-2026-000123');
    expect(sent?.search).toContain('email=ana%40shopcart.test');
  });

  it('is the same for a customer with an account', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({ ...home, 'GET /api/v1/orders/track': json(tracking()) });
    renderApp('/');

    await fill(user, 'PED-2026-000123', 'ana@shopcart.test');
    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000123' })).toBeDefined();
  });

  it('says it found nothing, without saying whether the number exists, when the data are not of an order', async () => {
    const user = userEvent.setup();
    installFakeApi({ ...home, 'GET /api/v1/orders/track': apiError(404, 'NOT_FOUND') });
    renderApp('/');

    await fill(user, 'PED-2026-000999', 'otra@shopcart.test');

    expect(
      await screen.findByText(/No encontramos un pedido con ese número y ese correo/),
    ).toBeDefined();
    expect(screen.queryByRole('heading', { name: /^Pedido PED-/ })).toBeNull();
  });

  it('asks for both data and for the format of the number before calling the server', async () => {
    const user = userEvent.setup();
    const { calls } = installFakeApi(home);
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText('Escriba el número de pedido.')).toBeDefined();
    expect(screen.getByText('Escriba el correo del pedido.')).toBeDefined();

    await user.type(screen.getByLabelText('Número de pedido'), '123');
    await user.type(screen.getByLabelText('Correo del pedido'), 'no-es-un-correo');
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText('El número tiene el formato PED-2026-000123.')).toBeDefined();
    expect(screen.getByText('Escriba un correo válido.')).toBeDefined();
    await waitFor(() => {
      expect(calls.some((call) => call.path === '/api/v1/orders/track')).toBe(false);
    });
  });
});

describe('the status of an order whose proof is waiting', () => {
  it('shows it as pending verification instead of pending payment', async () => {
    const user = userEvent.setup();
    installFakeApi({
      ...home,
      'GET /api/v1/orders/track': json(
        tracking({
          paymentStatusName: 'UnderReview',
          history: [
            { idNewStatus: 1, newStatusName: 'PendingPayment', createdAt: '2026-11-06T15:00:00Z' },
            { newStatusName: 'PaymentUnderReview', createdAt: '2026-11-06T16:00:00Z' },
          ],
        }),
      ),
    });
    renderApp('/');

    await fill(user, 'PED-2026-000123', 'ana@shopcart.test');

    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000123' })).toBeDefined();
    expect(screen.getAllByText('Pendiente de verificación de pago').length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
