// cspell:disable
import { cleanup, screen } from '@testing-library/react';
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

const order = {
  idOrder: 7,
  orderNumber: 'PED-2026-000007',
  total: '145.00',
  requestedDeliveryDate: '2030-06-10',
};

const payment = (extra = {}) => ({
  idPayment: 1,
  isCurrent: true,
  statusName: 'Pending',
  amount: '145.00',
  bankName: 'Banco Industrial',
  accountNumber: '0123456789',
  accountType: 'Checking',
  holderName: 'Pastelería SA',
  expiresAt: '2099-01-01T00:00:00Z',
  attemptsRejected: 0,
  maxAttempts: 3,
  proofs: [],
  ...extra,
});

describe('the payment page', () => {
  it('shows how to deposit and asks for the proof while the payment waits', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([payment()]),
      'GET /api/v1/bank-accounts': json([
        {
          idBankAccount: 2,
          bankName: 'Banco Industrial',
          accountType: 'Checking',
          accountNumber: '0123456789',
          holderName: 'Pastelería SA',
        },
        {
          idBankAccount: 3,
          bankName: 'Banrural',
          accountType: 'Savings',
          accountNumber: '9876543210',
          holderName: 'Pastelería SA',
        },
      ]),
    });
    renderApp('/orders/7/payment');

    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' })).toBeDefined();
    expect(screen.getByText('Esperando su depósito')).toBeDefined();
    // Las dos cuentas se muestran como texto, cada una aparte
    expect(await screen.findByText(/0123456789/)).toBeDefined();
    expect(screen.getByText(/9876543210/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Enviar comprobante' })).toBeDefined();
  });

  it('shows the reason and the retry after a rejection, without the proof form', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([
        payment({ statusName: 'Rejected', rejectionReason: 'Monto distinto', attemptsRejected: 1 }),
      ]),
    });
    renderApp('/orders/7/payment');

    expect(await screen.findByText('Comprobante rechazado')).toBeDefined();
    expect(screen.getByText('Motivo: Monto distinto')).toBeDefined();
    expect(screen.getByText('Le quedan 2 intentos.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Subir otro comprobante' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Enviar comprobante' })).toBeNull();
  });

  it('answers an order that is not the customer’s as one that does not exist', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/9': apiError(404, 'ORDER_NOT_FOUND'),
      'GET /api/v1/orders/9/payment': apiError(404, 'ORDER_NOT_FOUND'),
    });
    renderApp('/orders/9/payment');

    expect(await screen.findByText('Este pedido no existe')).toBeDefined();
  });

  it('sends a visitor without a session to sign in', async () => {
    installFakeApi({});
    renderApp('/orders/7/payment');
    expect(await screen.findByRole('heading', { name: /iniciar sesión/i })).toBeDefined();
  });
});

describe('a payment in cash', () => {
  it('says where to pay and asks for no proof', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json({
        ...order,
        fulfilmentType: 'Pickup',
        pickupBranchName: 'Sucursal Centro',
        pickupBranchAddress: '6a avenida 10-20, Guatemala',
      }),
      'GET /api/v1/orders/7/payment': json([
        payment({ methodKind: 'Cash', bankName: null, accountNumber: null, accountType: null }),
      ]),
    });
    renderApp('/orders/7/payment');

    expect(await screen.findByRole('heading', { name: 'Pague en la sucursal' })).toBeDefined();
    expect(screen.getByText(/Sucursal Centro/)).toBeDefined();
    expect(screen.getByText(/6a avenida 10-20, Guatemala/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Enviar comprobante' })).toBeNull();
    expect(screen.queryByText('Cuentas donde puede depositar')).toBeNull();
  });

  it('talks about paying in cash in the status, not about a deposit', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json({
        ...order,
        fulfilmentType: 'Pickup',
        pickupBranchName: 'Centro',
      }),
      'GET /api/v1/orders/7/payment': json([payment({ methodKind: 'Cash' })]),
    });
    renderApp('/orders/7/payment');

    expect(await screen.findByText('Esperando su pago en efectivo')).toBeDefined();
    expect(
      screen.getByText(/reservado hasta que llegue a la sucursal y pague en efectivo/),
    ).toBeDefined();
    expect(screen.queryByText('Esperando su depósito')).toBeNull();
    expect(screen.queryByText(/mientras llega el depósito/)).toBeNull();
  });

  it('says the cash was received once the payment is approved, and that the time ran out when it expires', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([
        payment({ methodKind: 'Cash', statusName: 'Approved' }),
      ]),
    });
    renderApp('/orders/7/payment');
    expect(await screen.findByText('Pago recibido')).toBeDefined();
    expect(screen.getByText(/Recibimos su pago en efectivo/)).toBeDefined();
    cleanup();

    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([
        payment({ methodKind: 'Cash', statusName: 'Expired' }),
      ]),
    });
    renderApp('/orders/7/payment');
    expect(await screen.findByText(/No se pagó en la sucursal a tiempo/)).toBeDefined();
  });

  it('keeps the deposit wording for a deposit payment', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([payment({ methodKind: 'Deposit' })]),
    });
    renderApp('/orders/7/payment');
    expect(await screen.findByText('Esperando su depósito')).toBeDefined();
  });
});
