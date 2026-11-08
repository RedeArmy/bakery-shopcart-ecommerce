import { createHash } from 'node:crypto';
import { AppError, err, ok } from '../../../shared-kernel/index.js';
import type { Result } from '../../../shared-kernel/index.js';

/** La clase de un método de pago decide cómo se procesa: tarjeta (pasarela), depósito (comprobante) o efectivo (en sucursal). */
export type PaymentMethodKind = 'Card' | 'Deposit' | 'Cash';

/** Un método de pago tal como lo deja el mantenimiento: su texto y para qué forma de recibir el pedido se ofrece. */
export interface PaymentMethodRow {
  idPaymentMethod: number;
  code: string;
  kind: PaymentMethodKind;
  title: string;
  description: string | null;
  appliesToDelivery: boolean;
  appliesToPickup: boolean;
  isActive: boolean;
}

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
  /** Instrucciones para quien entrega; solo con entrega a domicilio */
  deliveryNotes: string | null;
  idPaymentMethod: number;
  /** Solo por compatibilidad con llamadas anteriores: las cuentas ya no se eligen, se muestran */
  idBankAccount: number | null;
}

/** Puerto de datos del checkout; el adaptador SQL llama a SP_Cart_Get, SP_Inventory_ReserveStock y SP_Orders_CreateOrder. */
export interface CheckoutRepositoryPort {
  cartSummary(userId: number): Promise<CartSummary>;
  reserve(userId: number, idCart: number): Promise<{ idReservation: number; expiresAt: string }>;
  depositWindow(userId: number, deliveryDate: string | null): Promise<DepositWindow>;
  bankAccounts(): Promise<BankAccount[]>;
  /** Los métodos activos que se ofrecen para esta forma de recibir el pedido */
  paymentMethods(fulfilment: FulfilmentType): Promise<PaymentMethodRow[]>;
  createOrder(input: {
    userId: number;
    idReservation: number;
    fulfilmentType: FulfilmentType;
    idAddress: number | null;
    idBranch: number | null;
    deliveryDate: string | null;
    deliveryNotes: string | null;
    idPaymentMethod: number;
    storedKey: string;
    idBankAccount: number | null;
  }): Promise<CreatedOrder>;
}

export interface MethodOffer {
  idPaymentMethod: number;
  code: string;
  kind: PaymentMethodKind;
  title: string;
  description: string | null;
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

  /**
   * Lo que se le ofrece al cliente según cómo recibe el pedido: los métodos activos que el mantenimiento marcó para esa forma
   * (el efectivo solo para recogidas). El depósito depende del plazo que deja la fecha estimada; la tarjeta, de la pasarela.
   * Las cuentas bancarias se muestran como información: no se eligen.
   */
  async paymentMethods(
    userId: number,
    fulfilment: FulfilmentType,
    deliveryDate: string | null,
  ): Promise<PaymentMethodsView> {
    const [window, rows] = await Promise.all([
      this.repository.depositWindow(userId, deliveryDate),
      this.repository.paymentMethods(fulfilment),
    ]);
    let depositReason: string | null = null;
    if (!window.deliveryDateAllowed) depositReason = 'DELIVERY_DATE_TOO_SOON';
    else if (!window.depositAvailable) depositReason = 'DEPOSIT_UNAVAILABLE_FOR_DATE';

    const methods = rows
      .filter((row) => row.kind !== 'Card' || this.cardAvailable)
      .map((row): MethodOffer => {
        const base = {
          idPaymentMethod: row.idPaymentMethod,
          code: row.code,
          kind: row.kind,
          title: row.title,
          description: row.description,
        };
        if (row.kind === 'Deposit') {
          return {
            ...base,
            available: depositReason === null,
            reason: depositReason,
            deadlineAt: depositReason === null ? window.depositDeadlineAt : null,
          };
        }
        return { ...base, available: true, reason: null, deadlineAt: null };
      });
    const showsAccounts = methods.some((method) => method.kind === 'Deposit' && method.available);

    return {
      deliveryDate: window.deliveryDate,
      estimatedDeliveryDate: window.estimatedDeliveryDate,
      earliestDeliveryDate: window.earliestDeliveryDate,
      deliveryDateAllowed: window.deliveryDateAllowed,
      methods,
      bankAccounts: showsAccounts ? await this.repository.bankAccounts() : [],
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
    // Doble validación: el panel oculta lo no disponible, pero el backend también decide. El método debe estar activo y ofrecerse
    // para esta forma de recibir el pedido (la base de datos lo vuelve a comprobar en SP_Orders_CreateOrder).
    const offered = await this.repository.paymentMethods(command.fulfilmentType);
    const method = offered.find((row) => row.idPaymentMethod === command.idPaymentMethod);
    if (method === undefined || (method.kind === 'Card' && !this.cardAvailable)) {
      return err(
        new AppError(
          422,
          'PAYMENT_METHOD_UNAVAILABLE',
          'The payment method is not offered for this order',
        ),
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
    if (command.deliveryNotes !== null && command.fulfilmentType !== 'Delivery') {
      return err(new AppError(400, 'VALIDATION_ERROR', 'Delivery notes apply to a delivery only'));
    }
    return ok(
      await this.repository.createOrder({
        userId: command.userId,
        idReservation: command.idReservation,
        fulfilmentType: command.fulfilmentType,
        idAddress: command.idAddress,
        idBranch: command.idBranch,
        deliveryDate: command.deliveryDate,
        deliveryNotes: command.deliveryNotes,
        idPaymentMethod: method.idPaymentMethod,
        storedKey: storedKeyOf(command.userId, command.idempotencyKey),
        idBankAccount: method.kind === 'Deposit' ? command.idBankAccount : null,
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
