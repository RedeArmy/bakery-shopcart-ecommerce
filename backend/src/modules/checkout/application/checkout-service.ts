import { createHash } from 'node:crypto';
import { AppError, err, ok } from '../../../shared-kernel/index.js';
import type { Result } from '../../../shared-kernel/index.js';

export type PaymentMethodCode = 'CARD' | 'BANK_DEPOSIT';

/** Cómo recibe el cliente el pedido: en su dirección o recogiéndolo en una sucursal. */
export type FulfilmentType = 'Delivery' | 'Pickup';

export interface CartSummary {
  idCart: number | null;
  itemCount: number;
  hasUnavailableLines: boolean;
}

export interface DepositWindow {
  leadTimeDays: number;
  /** La fecha que se evaluó: la pedida o, si no se pidió ninguna, la estimada por el sistema */
  deliveryDate: string;
  /** La fecha que define el sistema: la primera que respeta la anticipación y deja tiempo para pagar */
  estimatedDeliveryDate: string;
  earliestDeliveryDate: string;
  deliveryDateAllowed: boolean;
  depositDeadlineAt: string;
  minutesAvailable: number;
  minDepositHours: number;
  depositAvailable: boolean;
}

export interface BankAccount {
  idBankAccount: number;
  bankName: string;
  accountType: string;
  accountNumber: string;
  holderName: string;
  currency: string;
  instructions: string | null;
}

export interface CreatedOrder {
  idOrder: number;
  idPayment: number;
  orderNumber: string;
  paymentExpiresAt: string;
}

export interface ConfirmCommand {
  userId: number;
  idempotencyKey: string;
  idReservation: number;
  fulfilmentType: FulfilmentType;
  /** Solo con entrega a domicilio */
  idAddress: number | null;
  /** Solo con recogida */
  idBranch: number | null;
  /** Ya no la elige el cliente: sin fecha la define el sistema (una fecha enviada se sigue validando) */
  deliveryDate: string | null;
  method: PaymentMethodCode;
  idBankAccount: number | null;
}

/** Puerto de datos del checkout; el adaptador SQL llama a SP_Cart_Get, SP_Inventory_ReserveStock y SP_Orders_CreateOrder. */
export interface CheckoutRepositoryPort {
  cartSummary(userId: number): Promise<CartSummary>;
  reserve(userId: number, idCart: number): Promise<{ idReservation: number; expiresAt: string }>;
  depositWindow(userId: number, deliveryDate: string | null): Promise<DepositWindow>;
  bankAccounts(): Promise<BankAccount[]>;
  createOrder(input: {
    userId: number;
    idReservation: number;
    fulfilmentType: FulfilmentType;
    idAddress: number | null;
    idBranch: number | null;
    deliveryDate: string | null;
    idPaymentMethod: number;
    storedKey: string;
    idBankAccount: number | null;
  }): Promise<CreatedOrder>;
}

export interface MethodOffer {
  method: PaymentMethodCode;
  available: boolean;
  /** Código estable de por qué no está disponible; el panel lo traduce */
  reason: string | null;
  deadlineAt: string | null;
}

export interface PaymentMethodsView {
  deliveryDate: string;
  /** La fecha estimada de entrega o recogida; el cliente la ve como una estimación, no la elige */
  estimatedDeliveryDate: string;
  earliestDeliveryDate: string;
  deliveryDateAllowed: boolean;
  methods: MethodOffer[];
  bankAccounts: BankAccount[];
}

const METHOD_ID: Record<PaymentMethodCode, number> = { CARD: 1, BANK_DEPOSIT: 2 };

/**
 * Casos de uso del checkout. El backend decide qué métodos ofrece (la tarjeta depende de las credenciales del proveedor),
 * pero no calcula ningún importe: el total, el descuento y el IVA salen de la base de datos en SP_Orders_CreateOrder.
 */
export class CheckoutService {
  constructor(
    private readonly repository: CheckoutRepositoryPort,
    /** Fase 1: no hay pasarela, así que la tarjeta nunca se ofrece; la Fase 2 lo cambia con las credenciales */
    private readonly cardAvailable: boolean,
  ) {}

  async paymentMethods(userId: number, deliveryDate: string | null): Promise<PaymentMethodsView> {
    const window = await this.repository.depositWindow(userId, deliveryDate);
    let depositReason: string | null = null;
    if (!window.deliveryDateAllowed) depositReason = 'DELIVERY_DATE_TOO_SOON';
    else if (!window.depositAvailable) depositReason = 'DEPOSIT_UNAVAILABLE_FOR_DATE';
    return {
      deliveryDate: window.deliveryDate,
      estimatedDeliveryDate: window.estimatedDeliveryDate,
      earliestDeliveryDate: window.earliestDeliveryDate,
      deliveryDateAllowed: window.deliveryDateAllowed,
      methods: [
        {
          method: 'BANK_DEPOSIT',
          available: depositReason === null,
          reason: depositReason,
          deadlineAt: depositReason === null ? window.depositDeadlineAt : null,
        },
        {
          method: 'CARD',
          available: this.cardAvailable,
          reason: this.cardAvailable ? null : 'PAYMENT_METHOD_UNAVAILABLE',
          deadlineAt: null,
        },
      ],
      bankAccounts: depositReason === null ? await this.repository.bankAccounts() : [],
    };
  }

  /** Reserva el stock del carrito por el tiempo configurado; sin carrito o con una línea agotada no se reserva nada. */
  async start(
    userId: number,
  ): Promise<Result<{ idReservation: number; expiresAt: string }, AppError>> {
    const cart = await this.repository.cartSummary(userId);
    if (cart.idCart === null || cart.itemCount === 0) {
      return err(new AppError(422, 'CART_EMPTY', 'The cart has no items'));
    }
    if (cart.hasUnavailableLines) {
      return err(
        new AppError(
          409,
          'CART_HAS_UNAVAILABLE_LINES',
          'A line of the cart can no longer be bought',
        ),
      );
    }
    return ok(await this.repository.reserve(userId, cart.idCart));
  }

  /** Crea el pedido pendiente de pago. La base de datos valida reserva, dirección, fecha, cupón y montos en una transacción. */
  async confirm(command: ConfirmCommand): Promise<Result<CreatedOrder, AppError>> {
    // Doble validación: el panel oculta lo no disponible, pero el backend también decide
    if (command.method === 'CARD' && !this.cardAvailable) {
      return err(
        new AppError(422, 'PAYMENT_METHOD_UNAVAILABLE', 'The card payment is not available'),
      );
    }
    // Una entrega lleva dirección y ninguna sucursal; una recogida lleva sucursal y ninguna dirección
    if (
      command.fulfilmentType === 'Delivery' &&
      (command.idAddress === null || command.idBranch !== null)
    ) {
      return err(
        new AppError(400, 'VALIDATION_ERROR', 'A delivery needs an address and no branch'),
      );
    }
    if (
      command.fulfilmentType === 'Pickup' &&
      (command.idBranch === null || command.idAddress !== null)
    ) {
      return err(new AppError(400, 'VALIDATION_ERROR', 'A pickup needs a branch and no address'));
    }
    if (command.method === 'BANK_DEPOSIT' && command.idBankAccount === null) {
      return err(
        new AppError(
          400,
          'VALIDATION_ERROR',
          'A bank deposit needs the bank account to deposit into',
        ),
      );
    }
    return ok(
      await this.repository.createOrder({
        userId: command.userId,
        idReservation: command.idReservation,
        fulfilmentType: command.fulfilmentType,
        idAddress: command.idAddress,
        idBranch: command.idBranch,
        deliveryDate: command.deliveryDate,
        idPaymentMethod: METHOD_ID[command.method],
        storedKey: storedKeyOf(command.userId, command.idempotencyKey),
        idBankAccount: command.method === 'BANK_DEPOSIT' ? command.idBankAccount : null,
      }),
    );
  }
}

/**
 * La llave que llega es de quien la envía, pero la columna de la base de datos es única para todos: se mezcla con el IDUser
 * y se resume, de modo que dos personas con la misma llave no chocan y una llave nunca revela la cuenta.
 */
export function storedKeyOf(userId: number, key: string): string {
  return createHash('sha256').update(`${userId}:${key}`).digest('hex');
}
