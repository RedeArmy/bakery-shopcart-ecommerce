// cspell:disable
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { Countdown } from '../../src/shared/ui/countdown';
import { cartOf, line } from './support/cart-fixtures';
import { apiError, installFakeApi, json } from './support/fake-api';
import { renderApp, resetSession, signInAs } from './support/render';

beforeEach(async () => {
  await resetSession();
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

const withDeposit = (offer: Record<string, unknown>) => ({
  deliveryDate: '2030-06-10',
  earliestDeliveryDate: '2030-06-10',
  deliveryDateAllowed: true,
  methods: [
    {
      idPaymentMethod: 2,
      code: 'BANK_DEPOSIT',
      kind: 'Deposit',
      title: 'Depósito o transferencia bancaria',
      description: null,
      ...offer,
    },
  ],
  bankAccounts: [],
});

describe('the deposit offer when it is not available', () => {
  it('uses the text of the reason the server gives', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/cart': json(cartOf([line(11, 'Pastel Tres Leches', 1)])),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(
        withDeposit({ available: false, reason: 'DEPOSIT_UNAVAILABLE_FOR_DATE' }),
      ),
    });
    renderApp('/checkout');

    expect(
      await screen.findByText(
        'Falta muy poco para la entrega y ya no se puede pagar con depósito.',
      ),
    ).toBeDefined();
  });

  it('falls back to a generic text for a reason it does not know', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/cart': json(cartOf([line(11, 'Pastel Tres Leches', 1)])),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(
        withDeposit({ available: false, reason: 'SOMETHING_NEW' }),
      ),
    });
    renderApp('/checkout');

    expect(
      await screen.findByText('El depósito no está disponible en este momento.'),
    ).toBeDefined();
  });
});

describe('the payment page when something goes wrong', () => {
  it('treats an address that is not a number as an order that does not exist', async () => {
    await signInAs('Customer');
    installFakeApi({});
    renderApp('/orders/abc/payment');
    expect(await screen.findByText('Este pedido no existe')).toBeDefined();
  });

  it('shows the error and retries when the order cannot be loaded', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/orders/7': () =>
        failing
          ? apiError(500, 'INTERNAL_ERROR')
          : json({
              idOrder: 7,
              orderNumber: 'PED-2026-000007',
              total: '145.00',
              requestedDeliveryDate: '2030-06-10',
            }),
      'GET /api/v1/orders/7/payment': json([]),
    });
    renderApp('/orders/7/payment');

    expect(await screen.findByRole('alert')).toBeDefined();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Pedido PED-2026-000007' })).toBeDefined();
  });

  it('shows the error when the payments cannot be loaded', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json({
        idOrder: 7,
        orderNumber: 'PED-2026-000007',
        total: '145.00',
      }),
      'GET /api/v1/orders/7/payment': apiError(500, 'INTERNAL_ERROR'),
    });
    renderApp('/orders/7/payment');
    expect(await screen.findByRole('alert')).toBeDefined();
  });
});

describe('the order list when something goes wrong or grows', () => {
  it('shows the error of the list and lets the customer retry', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    let failing = true;
    installFakeApi({
      'GET /api/v1/orders': () =>
        failing
          ? apiError(500, 'INTERNAL_ERROR')
          : json({ items: [], page: 1, size: 10, total: 0 }),
    });
    renderApp('/orders');

    expect(await screen.findByRole('alert')).toBeDefined();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    // Sin pedidos, dentro de su cuenta, se le dice y se le ofrece el catálogo
    expect(await screen.findByText('Todavía no tiene pedidos')).toBeDefined();
  });

  it('goes to the next page and asks the server for it', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const summary = (id: number) => ({
      idOrder: id,
      orderNumber: `PED-2026-${String(id).padStart(6, '0')}`,
      statusName: 'Paid',
      total: '145.00',
    });
    const { calls } = installFakeApi({
      'GET /api/v1/orders': () => json({ items: [summary(1)], page: 1, size: 10, total: 25 }),
    });
    renderApp('/orders');

    await screen.findByText('PED-2026-000001');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(calls.some((call) => call.search.includes('page=2'))).toBe(true);
    });
  });
});

describe('the countdown', () => {
  it('shows the time left as minutes and seconds and warns once when it reaches zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const onExpire = vi.fn();
    render(<Countdown until="2030-01-01T00:00:02Z" onExpire={onExpire} />);

    expect(screen.getByText('00:02')).toBeDefined();
    expect(onExpire).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('shows the hours when more than one hour is left', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    render(<Countdown until="2030-01-02T00:00:00Z" />);
    expect(screen.getByText('24:00:00')).toBeDefined();
  });
});
