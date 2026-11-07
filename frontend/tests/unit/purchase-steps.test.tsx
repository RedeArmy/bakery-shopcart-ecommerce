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
  estimatedDeliveryDate: '2030-06-10',
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
    // Se habilita cuando la dirección y la cuenta ya están elegidas
    await waitFor(() => {
      expect(reserve.disabled).toBe(false);
    });
    await user.click(reserve);
    await user.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' })).toBeDefined();
    const confirm = calls.find((call) => call.path === '/api/v1/checkout/confirm');
    // No viaja ninguna fecha: la define el sistema
    expect(confirm?.body).toEqual({
      idReservation: 41,
      idBankAccount: 2,
      method: 'BANK_DEPOSIT',
      fulfilmentType: 'Delivery',
      idAddress: 3,
      idBranch: null,
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

describe('pickup at a branch', () => {
  const branch = {
    idBranch: 5,
    name: 'Centro',
    line1: '6a avenida 10-20',
    municipality: 'Guatemala',
    department: 'Guatemala',
    phone: '22221111',
    openingHours: 'Lunes a sábado de 8:00 a 18:00',
    isActive: true,
  };

  it('tells the customer the date is only an estimate and gives no calendar to pick one', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(methods()),
    });
    renderApp('/checkout');

    expect(await screen.findByText(/La fecha estimada de entrega es el/)).toBeDefined();
    expect(screen.getByText(/Es un estimado: puede ser unos días antes o después/)).toBeDefined();
    expect(screen.queryByLabelText('Día de entrega')).toBeNull();
  });

  it('offers the branches in the dropdown and asks for no address when one is chosen', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/branches': json([branch]),
      'GET /api/v1/checkout/payment-methods': json(methods()),
      'POST /api/v1/checkout/start': json({
        idReservation: 41,
        expiresAt: '2099-01-01T00:15:00Z',
      }),
      'POST /api/v1/checkout/confirm': json({
        idOrder: 8,
        idPayment: 2,
        orderNumber: 'PED-2026-000008',
        paymentExpiresAt: '2099-01-02T00:00:00Z',
      }),
      'GET /api/v1/orders/8': json({
        idOrder: 8,
        orderNumber: 'PED-2026-000008',
        total: '145.00',
        fulfilmentType: 'Pickup',
        pickupBranchName: 'Centro',
      }),
      'GET /api/v1/orders/8/payment': json([]),
    });
    renderApp('/checkout');

    const select = await screen.findByLabelText('Forma de recibirlo');
    await screen.findByRole('option', { name: 'Recoger en Centro' });
    expect(screen.getByRole('radio', { name: /Casa · Ana Pérez/ })).toBeDefined();

    await user.selectOptions(select, 'Recoger en Centro');

    // La sucursal se muestra con sus datos y la dirección de entrega desaparece
    expect(await screen.findByText(/6a avenida 10-20/)).toBeDefined();
    expect(screen.getByText('Teléfono: 22221111')).toBeDefined();
    expect(screen.getByText(/La fecha estimada para recogerlo es el/)).toBeDefined();
    expect(screen.queryByRole('radio', { name: /Casa · Ana Pérez/ })).toBeNull();

    const reserve = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Reservar mis productos',
    });
    await waitFor(() => {
      expect(reserve.disabled).toBe(false);
    });
    await user.click(reserve);
    await user.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    await screen.findByRole('heading', { name: 'Pedido PED-2026-000008' });
    const confirm = calls.find((call) => call.path === '/api/v1/checkout/confirm');
    expect(confirm?.body).toEqual({
      idReservation: 41,
      idBankAccount: 2,
      method: 'BANK_DEPOSIT',
      fulfilmentType: 'Pickup',
      idAddress: null,
      idBranch: 5,
    });
  });
});
