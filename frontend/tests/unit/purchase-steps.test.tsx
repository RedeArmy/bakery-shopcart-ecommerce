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
  methods: [
    {
      idPaymentMethod: 2,
      code: 'BANK_DEPOSIT',
      kind: 'Deposit',
      title: 'Depósito o transferencia bancaria',
      description: null,
      available: true,
      reason: null,
      deadlineAt: null,
    },
  ],
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
      idPaymentMethod: 2,
      fulfilmentType: 'Delivery',
      idAddress: 3,
      idBranch: null,
      deliveryNotes: null,
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
              idPaymentMethod: 2,
              code: 'BANK_DEPOSIT',
              kind: 'Deposit',
              title: 'Depósito o transferencia bancaria',
              description: null,
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

  it('offers the branches as cards and asks for no address when one is chosen', async () => {
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

    // La entrega a domicilio es la elección de partida y pide su dirección
    const pickup = await screen.findByRole('radio', { name: /Recoger en sucursal/ });
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: /Entrega a domicilio/ }).checked,
    ).toBe(true);
    expect(await screen.findByRole('radio', { name: /Casa · Ana Pérez/ })).toBeDefined();

    await user.click(pickup);

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
      idPaymentMethod: 2,
      fulfilmentType: 'Pickup',
      idAddress: null,
      idBranch: 5,
      deliveryNotes: null,
    });
  });
  it('shows the first three branches and the rest behind a button', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const many = [1, 2, 3, 4, 5].map((id) => ({
      ...branch,
      idBranch: id,
      name: `Sucursal ${String(id)}`,
    }));
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/branches': json(many),
      'GET /api/v1/checkout/payment-methods': json(methods()),
    });
    renderApp('/checkout');

    await user.click(await screen.findByRole('radio', { name: /Recoger en sucursal/ }));
    expect(screen.getAllByRole('radio', { name: /Sucursal \d/ })).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Ver las 5 sucursales' }));
    expect(screen.getAllByRole('radio', { name: /Sucursal \d/ })).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Ver menos sucursales' }));
    expect(screen.getAllByRole('radio', { name: /Sucursal \d/ })).toHaveLength(3);
  });

  it('does not offer the pickup when there are no branches', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(methods()),
    });
    renderApp('/checkout');

    const pickup = await screen.findByRole<HTMLInputElement>('radio', {
      name: /Recoger en sucursal/,
    });
    await waitFor(() => {
      expect(pickup.disabled).toBe(true);
    });
    expect(screen.getByText('Todavía no hay sucursales donde recoger.')).toBeDefined();
  });

  it('sends the delivery notes with a delivery and shows the three steps', async () => {
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
        idOrder: 9,
        idPayment: 3,
        orderNumber: 'PED-2026-000009',
        paymentExpiresAt: '2099-01-02T00:00:00Z',
      }),
      'GET /api/v1/orders/9': json({ idOrder: 9, orderNumber: 'PED-2026-000009', total: '145.00' }),
      'GET /api/v1/orders/9/payment': json([]),
    });
    renderApp('/checkout');

    const steps = await screen.findByRole('navigation', { name: 'Pasos de la compra' });
    expect(steps.textContent).toContain('Entrega');
    expect(steps.textContent).toContain('Pago');
    expect(steps.textContent).toContain('Confirmación');

    await user.type(
      await screen.findByLabelText(/Notas para la entrega/),
      '  Tocar el timbre dos veces ',
    );
    const reserve = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Reservar mis productos',
    });
    await waitFor(() => {
      expect(reserve.disabled).toBe(false);
    });
    await user.click(reserve);
    await user.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    await screen.findByRole('heading', { name: 'Pedido PED-2026-000009' });
    const confirm = calls.find((call) => call.path === '/api/v1/checkout/confirm');
    expect(confirm?.body).toMatchObject({ deliveryNotes: 'Tocar el timbre dos veces' });
  });
});

describe('the payment method', () => {
  const branch = {
    idBranch: 5,
    name: 'Centro',
    line1: '6a avenida 10-20',
    municipality: 'Guatemala',
    department: 'Guatemala',
    phone: '22221111',
    openingHours: null,
    isActive: true,
  };
  const deposit = {
    idPaymentMethod: 2,
    code: 'BANK_DEPOSIT',
    kind: 'Deposit',
    title: 'Depósito o transferencia bancaria',
    description: null,
    available: true,
    reason: null,
    deadlineAt: null,
  };
  const cashOffer = {
    idPaymentMethod: 3,
    code: 'CASH_ON_PICKUP',
    kind: 'Cash',
    title: 'Efectivo o contra entrega',
    description: 'Pague al recoger',
    available: true,
    reason: null,
    deadlineAt: null,
  };

  it('offers the cash only for a pickup and shows the accounts as text, never to choose', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/branches': json([branch]),
      'GET /api/v1/checkout/payment-methods': (call) =>
        json(
          methods({
            methods: call.search.includes('fulfilment=Pickup') ? [deposit, cashOffer] : [deposit],
          }),
        ),
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
      'GET /api/v1/orders/8': json({ idOrder: 8, orderNumber: 'PED-2026-000008', total: '145.00' }),
      'GET /api/v1/orders/8/payment': json([]),
    });
    renderApp('/checkout');

    // Para una entrega solo está el depósito, y sus cuentas se leen como texto
    expect(await screen.findByRole('heading', { name: 'Método de pago' })).toBeDefined();
    expect(
      await screen.findByRole('radio', { name: /Depósito o transferencia bancaria/ }),
    ).toBeDefined();
    expect(screen.queryByRole('radio', { name: /Efectivo/ })).toBeNull();
    expect(screen.getByText('Banco Industrial')).toBeDefined();
    expect(screen.queryByRole('radio', { name: /Banco Industrial/ })).toBeNull();

    await user.click(await screen.findByRole('radio', { name: /Recoger en sucursal/ }));
    const cashRadio = await screen.findByRole('radio', { name: /Efectivo o contra entrega/ });
    await user.click(cashRadio);
    expect(
      screen.getByText('Pagará en efectivo en la sucursal, al recoger su pedido.'),
    ).toBeDefined();
    expect(screen.queryByText('Banco Industrial')).toBeNull();

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
      idPaymentMethod: 3,
      fulfilmentType: 'Pickup',
      idAddress: null,
      idBranch: 5,
      deliveryNotes: null,
    });
  });

  it('says there is no method to pay with when the administrator left none for this way', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(methods({ methods: [], bankAccounts: [] })),
    });
    renderApp('/checkout');

    expect(
      await screen.findByText(
        'Todavía no hay métodos de pago para esta forma de recibir su pedido.',
      ),
    ).toBeDefined();
    const reserve = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Reservar mis productos',
    });
    expect(reserve.disabled).toBe(true);
  });
});
