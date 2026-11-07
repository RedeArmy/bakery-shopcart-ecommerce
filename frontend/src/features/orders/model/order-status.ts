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

export const statusTone = (status: string): StatusTone =>
  isOrderStatus(status) ? TONES[status] : 'neutral';

/** Hasta que se despacha un pedido el cliente puede cancelarlo; el servidor tiene la última palabra. */
export const canCancel = (status: string): boolean =>
  status === 'PendingPayment' || status === 'Paid' || status === 'InPreparation';

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
