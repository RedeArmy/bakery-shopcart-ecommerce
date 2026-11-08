// cspell:disable
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/shared/i18n';
import { cartOf, line } from './support/cart-fixtures';
import { apiError, installFakeApi, json } from './support/fake-api';
import { renderApp, resetSession, signInAs } from './support/render';

beforeEach(async () => {
  await resetSession();
  // jsdom no trae la vista previa de archivos
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: vi.fn() }),
  );
});

afterEach(async () => {
  cleanup();
  await resetSession();
  vi.unstubAllGlobals();
});

const cart = cartOf([line(11, 'Pastel Tres Leches', 1)]);

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

describe('the address of the checkout', () => {
  it('asks for the required data before saving', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([]),
      'GET /api/v1/checkout/payment-methods': json(methods()),
    });
    renderApp('/checkout');

    await user.click(await screen.findByRole('button', { name: 'Guardar dirección' }));

    expect((await screen.findAllByText('Este dato es obligatorio.')).length).toBeGreaterThan(0);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('saves a new address with an idempotency key and leaves it chosen', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    let saved = false;
    const { calls } = installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': () => json(saved ? [address] : []),
      'POST /api/v1/addresses': () => {
        saved = true;
        return json({ ...address }, { status: 201 });
      },
      'GET /api/v1/checkout/payment-methods': json(methods()),
    });
    renderApp('/checkout');

    await user.type(await screen.findByLabelText('Nombre de la dirección'), 'Casa');
    await user.type(screen.getByLabelText('Quién recibe'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Teléfono de quien recibe'), '5555-1234');
    await user.type(screen.getByLabelText('Municipio'), 'Guatemala');
    await user.type(screen.getByLabelText('Departamento'), 'Guatemala');
    await user.type(screen.getByLabelText('Dirección', { exact: true }), '5a avenida 10-20');
    await user.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    const radio = await screen.findByRole<HTMLInputElement>('radio', { name: /Casa · Ana Pérez/ });
    expect(radio.checked).toBe(true);
    const sent = calls.find((call) => call.method === 'POST' && call.path === '/api/v1/addresses');
    expect(sent?.body).toMatchObject({
      label: 'Casa',
      recipient: 'Ana Pérez',
      line1: '5a avenida 10-20',
    });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('says why an address could not be saved', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([]),
      'POST /api/v1/addresses': apiError(500, 'INTERNAL_ERROR'),
      'GET /api/v1/checkout/payment-methods': json(methods()),
    });
    renderApp('/checkout');

    await user.type(await screen.findByLabelText('Nombre de la dirección'), 'Casa');
    await user.type(screen.getByLabelText('Quién recibe'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Teléfono de quien recibe'), '5555-1234');
    await user.type(screen.getByLabelText('Municipio'), 'Guatemala');
    await user.type(screen.getByLabelText('Departamento'), 'Guatemala');
    await user.type(screen.getByLabelText('Dirección', { exact: true }), '5a avenida 10-20');
    await user.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('opens the form to add another address and closes it without saving', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(methods()),
    });
    renderApp('/checkout');

    await user.click(await screen.findByRole('button', { name: 'Agregar otra dirección' }));
    expect(screen.getByRole('heading', { name: 'Nueva dirección' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(await screen.findByRole('radio', { name: /Casa · Ana Pérez/ })).toBeDefined();
  });
});

describe('the deposit and the reservation', () => {
  it('shows the deadline of the deposit and the reason when it no longer reaches', async () => {
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
              available: true,
              reason: null,
              deadlineAt: '2099-01-01T12:00:00Z',
            },
          ],
        }),
      ),
    });
    renderApp('/checkout');

    expect(await screen.findByText(/Tiene hasta el/)).toBeDefined();
    // Las cuentas se muestran como texto: no se eligen
    expect(await screen.findByText('Banco Industrial')).toBeDefined();
    expect(screen.queryByRole('radio', { name: /Banco Industrial/ })).toBeNull();
  });

  it('drops the reservation and explains it when the confirmation says it expired', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/cart': json(cart),
      'GET /api/v1/addresses': json([address]),
      'GET /api/v1/checkout/payment-methods': json(methods()),
      'POST /api/v1/checkout/start': json({ idReservation: 41, expiresAt: '2099-01-01T00:15:00Z' }),
      'POST /api/v1/checkout/confirm': apiError(409, 'RESERVATION_EXPIRED'),
    });
    renderApp('/checkout');

    const reserve = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Reservar mis productos',
    });
    await waitFor(() => {
      expect(reserve.disabled).toBe(false);
    });
    await user.click(reserve);
    await user.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    expect(
      await screen.findByText('La reserva de 15 minutos venció. Inicie el pago otra vez.'),
    ).toBeDefined();
    expect(await screen.findByRole('button', { name: 'Reservar mis productos' })).toBeDefined();
  });
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
  idBankAccount: 2,
  bankName: 'Banco Industrial',
  accountNumber: '0123456789',
  accountType: 'Savings',
  holderName: 'Pastelería SA',
  expiresAt: '2099-01-01T00:00:00Z',
  attemptsRejected: 0,
  maxAttempts: 3,
  proofs: [],
  ...extra,
});

const png = (name = 'comprobante.png') => new File(['x'], name, { type: 'image/png' });

describe('the proof of the deposit', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(await screen.findByLabelText('Número de boleta'), '8812345');
  };

  it('asks for a file before sending', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    const { calls } = installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([payment()]),
    });
    renderApp('/orders/7/payment');

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Enviar comprobante' }));

    expect(await screen.findByText('Elija el archivo del comprobante.')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('warns about a type that is not accepted and a file that is too big', async () => {
    await signInAs('Customer');
    const user = userEvent.setup({ applyAccept: false });
    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([payment()]),
    });
    renderApp('/orders/7/payment');

    const input = await screen.findByLabelText('Foto o PDF del comprobante');
    await user.upload(input, new File(['x'], 'nota.gif', { type: 'image/gif' }));
    expect(await screen.findByText('El comprobante debe ser JPG, PNG o PDF.')).toBeDefined();

    const big = png('grande.png');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await user.upload(input, big);
    expect(await screen.findByText('El archivo pesa más de 5 MB.')).toBeDefined();
  });

  it('sends the proof as a form with its fields and moves to the review', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    let sent = false;
    const append = vi.spyOn(FormData.prototype, 'append');
    const { calls } = installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': () =>
        json([payment({ statusName: sent ? 'UnderReview' : 'Pending' })]),
      'POST /api/v1/orders/7/payment/proofs': () => {
        sent = true;
        return json({ idProof: 1 }, { status: 201 });
      },
    });
    renderApp('/orders/7/payment');

    await fill(user);
    await user.upload(screen.getByLabelText('Foto o PDF del comprobante'), png());
    expect(await screen.findByAltText('Vista previa del comprobante')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Enviar comprobante' }));

    expect(await screen.findByText('En revisión')).toBeDefined();
    // Los campos del formulario se leen de lo que se le agregó: en jsdom su cuerpo no llega como multipart
    const fields = new Map(append.mock.calls.map(([name, value]) => [name, value]));
    expect(fields.get('referenceNumber')).toBe('8812345');
    expect(fields.get('depositedAmount')).toBe('145.00');
    expect((fields.get('file') as File).name).toBe('comprobante.png');
    const upload = calls.find((call) => call.path === '/api/v1/orders/7/payment/proofs');
    expect(upload?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('shows the answer of the server when the proof was already used', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([payment()]),
      'POST /api/v1/orders/7/payment/proofs': apiError(409, 'PAYMENT_PROOF_REUSED'),
    });
    renderApp('/orders/7/payment');

    await fill(user);
    await user.upload(screen.getByLabelText('Foto o PDF del comprobante'), png());
    await user.click(screen.getByRole('button', { name: 'Enviar comprobante' }));

    expect(await screen.findByText('Ese comprobante ya se usó en otro pago.')).toBeDefined();
  });
});

describe('another attempt after a rejection', () => {
  const rejected = (extra = {}) =>
    payment({
      statusName: 'Rejected',
      rejectionReason: 'Monto distinto',
      attemptsRejected: 1,
      ...extra,
    });

  it('opens another attempt with the same bank account', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    let reopened = false;
    const { calls } = installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': () => json([reopened ? payment() : rejected()]),
      'POST /api/v1/orders/7/payment/attempts': () => {
        reopened = true;
        return json({ idPayment: 2 }, { status: 201 });
      },
    });
    renderApp('/orders/7/payment');

    await user.click(await screen.findByRole('button', { name: 'Subir otro comprobante' }));

    expect(await screen.findByText('Esperando su depósito')).toBeDefined();
    const sent = calls.find((call) => call.path === '/api/v1/orders/7/payment/attempts');
    expect(sent?.body).toEqual({ idBankAccount: 2 });
    expect(sent?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('shows why another attempt was refused', async () => {
    await signInAs('Customer');
    const user = userEvent.setup();
    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([rejected()]),
      'POST /api/v1/orders/7/payment/attempts': apiError(409, 'DEPOSIT_ATTEMPTS_EXCEEDED'),
    });
    renderApp('/orders/7/payment');

    await user.click(await screen.findByRole('button', { name: 'Subir otro comprobante' }));
    expect(
      await screen.findByText('Este pedido ya usó todos sus intentos de depósito.'),
    ).toBeDefined();
  });

  it('says there are no attempts left instead of offering another one', async () => {
    await signInAs('Customer');
    installFakeApi({
      'GET /api/v1/orders/7': json(order),
      'GET /api/v1/orders/7/payment': json([rejected({ attemptsRejected: 3 })]),
    });
    renderApp('/orders/7/payment');

    expect(
      await screen.findByText('Ya no quedan intentos. Escríbanos para resolverlo.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Subir otro comprobante' })).toBeNull();
  });
});
