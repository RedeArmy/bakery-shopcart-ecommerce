import type { components } from '../../../shared/api/generated/schema';

/** Los estados de un pedido tal como los nombra el API, en el orden de su identificador (1 a 8). */
export const ORDER_STATUSES = [
  'PendingPayment',
  'Paid',
  'InPreparation',
  'Dispatched',
  'Delivered',
  'Cancelled',
  'PartiallyReturned',
  'Returned',
] as const;

export type OrderStatusName = (typeof ORDER_STATUSES)[number];

export type StatusTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

const TONES: Record<OrderStatusName, StatusTone> = {
  PendingPayment: 'warning',
  Paid: 'accent',
  InPreparation: 'accent',
  Dispatched: 'accent',
  Delivered: 'success',
  Cancelled: 'danger',
  PartiallyReturned: 'neutral',
  Returned: 'neutral',
};

export const isOrderStatus = (value: string): value is OrderStatusName =>
  (ORDER_STATUSES as readonly string[]).includes(value);

/**
 * Momentos del pago que el cliente ve junto a los estados del pedido, aunque no son estados del pedido (ADR-0015): el
 * comprobante llegó y está por verificarse, o el depósito se rechazó. El pedido sigue pendiente de pago.
 */
export const PAYMENT_STAGES = ['PaymentUnderReview', 'PaymentRejected'] as const;

export type PaymentStageName = (typeof PAYMENT_STAGES)[number];

const STAGE_TONES: Record<PaymentStageName, StatusTone> = {
  PaymentUnderReview: 'accent',
  PaymentRejected: 'danger',
};

export const isPaymentStage = (value: string): value is PaymentStageName =>
  (PAYMENT_STAGES as readonly string[]).includes(value);

/** Un estado del pedido o un momento del pago: los dos tienen texto en español. */
export const isKnownStatus = (value: string): value is OrderStatusName | PaymentStageName =>
  isOrderStatus(value) || isPaymentStage(value);

export const statusTone = (status: string): StatusTone => {
  if (isOrderStatus(status)) return TONES[status];
  return isPaymentStage(status) ? STAGE_TONES[status] : 'neutral';
};

/**
 * Lo que se le dice al cliente como estado del pedido. Un pedido pendiente de pago cuyo comprobante ya llegó no está
 * "pendiente de pago" a secas: está pendiente de que alguien verifique el pago.
 */
export const displayStatus = (statusName: string, paymentStatusName?: string | null): string =>
  statusName === 'PendingPayment' && paymentStatusName === 'UnderReview'
    ? 'PaymentUnderReview'
    : statusName;

/** Lo que se puede hacer con un pedido: preparar, despachar, entregar, cancelar o devolver. */
export type OrderAction = components['schemas']['OrderAction'];

/**
 * ¿El servidor ofrece esta acción sobre el pedido a quien lo consulta? La regla (qué estado, cómo se recibe, qué rol) vive en
 * la base de datos, que es también quien la exige; aquí solo se lee la respuesta y no se vuelve a calcular.
 */
export const allows = (
  order: { allowedActions: readonly OrderAction[] },
  action: OrderAction,
): boolean => order.allowedActions.includes(action);

export const PAGE_SIZE = 10;

/** Lee `page` y `status` de la dirección; lo que no sea un número válido se ignora. */
export function parseOrdersQuery(params: URLSearchParams): { page: number; status: number | null } {
  const page = Number(params.get('page'));
  const status = Number(params.get('status'));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    status:
      Number.isInteger(status) && status >= 1 && status <= ORDER_STATUSES.length ? status : null,
  };
}
