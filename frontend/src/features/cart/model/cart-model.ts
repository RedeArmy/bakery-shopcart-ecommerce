import type { components } from '../../../shared/api/generated/schema';

export type Cart = components['schemas']['Cart'];
export type CartLine = components['schemas']['CartLine'];

/** Tope por línea que fija el contrato (CartItemRequest). */
export const MAX_QUANTITY = 99;
export const MAX_INSCRIPTION = 60;

/** Un carrito vacío: lo que ve el visitante que todavía no agregó nada, sin pedirlo al servidor. */
export const EMPTY_CART: Cart = {
  idCart: null,
  subtotal: '0.00',
  discount: '0.00',
  total: '0.00',
  vat: '0.00',
  taxableBase: '0.00',
  itemCount: 0,
  hasUnavailableLines: false,
  lines: [],
};

/**
 * Cantidad que se pide al agregar: lo que ya había más lo elegido, sin pasar de 99. El servidor es quien decide si hay
 * existencias (409 INSUFFICIENT_STOCK); esto solo evita enviar un valor que el contrato rechaza.
 */
export const nextQuantity = (current: number, add: number): number =>
  Math.min(MAX_QUANTITY, Math.max(1, current + add));

/** Hasta cuántas unidades se puede subir una línea desde su selector. */
export const lineLimit = (line: Pick<CartLine, 'available'>): number =>
  Math.min(MAX_QUANTITY, Math.max(0, line.available ?? MAX_QUANTITY));

/** La línea ya no se puede comprar tal como está: agotada, o con más unidades de las que quedan. */
export const lineBlocked = (
  line: Pick<CartLine, 'isAvailable' | 'quantity' | 'available'>,
): boolean =>
  line.isAvailable === false || (line.available !== undefined && line.quantity > line.available);

/** El importe es cero ("0.00"): sirve para no mostrar un descuento vacío. Solo mira el texto, no calcula nada. */
export const isZeroMoney = (amount: string): boolean => /^0+(\.0+)?$/.test(amount);

const REASONS = [
  'Expired',
  'Exhausted',
  'AlreadyUsed',
  'Inactive',
  'NotFound',
  'NotStarted',
  'MinimumNotMet',
  'NotApplicable',
] as const;

/** Clave i18n del motivo por el que el cupón dejó de descontar; un motivo nuevo del servidor cae en el texto genérico. */
export const couponReasonKey = (reason: string): string =>
  (REASONS as readonly string[]).includes(reason)
    ? `cart.coupon.reasons.${reason}`
    : 'cart.coupon.reasons.Unknown';
