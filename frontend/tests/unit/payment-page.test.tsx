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
    });
    renderApp('/orders/7/payment');

    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' })).toBeDefined();
    expect(screen.getByText('Esperando su depósito')).toBeDefined();
    expect(screen.getByText('0123456789', { exact: false })).toBeDefined();
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
