// cspell:disable
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { apiError, installFakeApi, json } from './support/fake-api';
import { cartOf, line } from './support/cart-fixtures';
import { renderApp, resetSession, signInAs } from './support/render';

beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const address = {
  idAddress: 3,
  label: 'Casa',
  recipient: 'Ana Pérez',
  phone: '5555-1234',
  line1: '5a avenida 10-20',
  municipality: 'Guatemala',
  department: 'Guatemala',
};

const bank = {
  idBankAccount: 2,
  bankName: 'Banco Industrial',
  accountType: 'Checking',
  accountNumber: '0123456789',
  holderName: 'Pastelería SA',
};

const methods = (extra = {}) => ({
  deliveryDate: '2030-06-10',
  earliestDeliveryDate: '2030-06-10',
  deliveryDateAllowed: true,
  methods: [{ method: 'BANK_DEPOSIT', available: true, reason: null, deadlineAt: null }],
  bankAccounts: [bank],
  ...extra,
});

const cart = cartOf([line(11, 'Pastel Tres Leches', 1)]);

describe('the purchase steps of the checkout', () => {
  it('reserves, confirms with the chosen data and opens the payment of the new order', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(methods()),
      'POST /api/v1/checkout/start': json({
        idReservation: 41,
        expiresAt: '2099-01-01T00:15:00Z',
      }),
      'POST /api/v1/checkout/confirm': json({
        idOrder: 7,
        idPayment: 1,
        orderNumber: 'PED-2026-000007',
        paymentExpiresAt: '2099-01-02T00:00:00Z',
      }),
      'GET /api/v1/orders/7': json({
        idOrder: 7,
        orderNumber: 'PED-2026-000007',
        total: '145.00',
        requestedDeliveryDate: '2030-06-10',
      }),
      'GET /api/v1/orders/7/payment': json([]),
    });
    renderApp('/checkout');

    const reserve = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Reservar mis productos',
    });
    // Se habilita cuando la dirección, la fecha y la cuenta ya están elegidas
    await waitFor(() => {
      expect(reserve.disabled).toBe(false);
    });
    await user.click(reserve);
    await user.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' })).toBeDefined();
    const confirm = calls.find((call) => call.path === '/api/v1/checkout/confirm');
    expect(confirm?.body).toEqual({
      idReservation: 41,
      idAddress: 3,
      deliveryDate: '2030-06-10',
      method: 'BANK_DEPOSIT',
      idBankAccount: 2,
    });
    // La confirmación lleva su llave de idempotencia, para que repetirla no cree dos pedidos
    expect(confirm?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('does not let the customer reserve until the deposit is possible', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(
        methods({
          methods: [
            {
              method: 'BANK_DEPOSIT',
              available: false,
              reason: 'DEADLINE_PASSED',
              deadlineAt: null,
            },
          ],
        }),
      ),
    });
    renderApp('/checkout');

    const reserve = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Reservar mis productos',
    });
    expect(reserve.disabled).toBe(true);
  });

  it('shows the server answer when the reservation fails', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(methods()),
      'POST /api/v1/checkout/start': apiError(409, 'INSUFFICIENT_STOCK'),
    });
    renderApp('/checkout');

    const reserve = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Reservar mis productos',
    });
    await waitFor(() => {
      expect(reserve.disabled).toBe(false);
    });
    await user.click(reserve);
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Confirmar pedido' })).toBeNull();
  });
});
