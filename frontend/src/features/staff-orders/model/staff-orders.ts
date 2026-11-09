import { isDateOnly } from '../../../shared/lib/date';
import { parseOrdersQuery } from '../../orders/model/order-status';
import type { OrderAction } from '../../orders/model/order-status';

/** Cuántos pedidos se ven por página en la administración. */
export const PAGE_SIZE = 10;

export interface StaffOrdersQuery {
  /** Identificador del estado (1 a 8) o `null` para verlos todos */
  status: number | null;
  page: number;
  /** Número de pedido o correo del cliente, tal cual lo busca el servidor */
  search: string;
  /** Primer día (inclusive) en que se hizo el pedido, `aaaa-mm-dd`, o `null` */
  from: string | null;
  /** Último día (inclusive) en que se hizo el pedido, `aaaa-mm-dd`, o `null` */
  to: string | null;
}

/**
 * Lo que dice la dirección: el estado, el texto buscado y la página. Lo que no se entiende vuelve al valor por omisión en lugar
 * de romper la pantalla.
 */
export function parseStaffOrdersQuery(params: URLSearchParams): StaffOrdersQuery {
  const { page, status } = parseOrdersQuery(params);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  return {
    page,
    status,
    search: (params.get('q') ?? '').trim().slice(0, 100),
    from: isDateOnly(from) ? from : null,
    to: isDateOnly(to) ? to : null,
  };
}

/** La dirección para una consulta: solo lleva lo que se aparta del valor por omisión. */
export function staffOrdersParams(query: StaffOrdersQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.status !== null) params.set('status', String(query.status));
  if (query.search !== '') params.set('q', query.search);
  if (query.from !== null) params.set('from', query.from);
  if (query.to !== null) params.set('to', query.to);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

export type NextStep = 'InPreparation' | 'Dispatched' | 'Delivered';

// El API recibe el nombre del estado al que se pasa; el servidor ofrece el nombre de la acción
const STEP_OF_ACTION: Partial<Record<OrderAction, NextStep>> = {
  Prepare: 'InPreparation',
  Dispatch: 'Dispatched',
  Deliver: 'Delivered',
};

/**
 * El paso que quien consulta puede dar ahora, o `null` si ninguno, a partir de las acciones que ofrece el servidor. No decide
 * qué paso toca (si se despacha o se entrega, si lo da un operador o un administrador): eso lo dice la base de datos.
 */
export function stepToTake(allowed: readonly OrderAction[]): NextStep | null {
  for (const action of allowed) {
    const step = STEP_OF_ACTION[action];
    if (step !== undefined) return step;
  }
  return null;
}

export interface ReturnableLine {
  idOrderLine: number;
  quantity: number;
  returnedQuantity?: number;
}

/** Las unidades de una línea que todavía se pueden devolver. */
export const pendingReturn = (line: ReturnableLine): number =>
  line.quantity - (line.returnedQuantity ?? 0);

export const REASON_MAX = 250;

export type ReturnProblem =
  'reasonRequired' | 'reasonTooLong' | 'nothingSelected' | 'quantityInvalid';

export type ReturnDraft =
  | { ok: true; body: { reason: string; lines: { idOrderLine: number; quantity: number }[] } }
  | { ok: false; problem: ReturnProblem };

/** Una cantidad escrita: vacía es cero; solo vale un entero entre cero y lo que queda por devolver. */
function parseQuantity(text: string, limit: number): number | null {
  if (text.trim() === '') return 0;
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 && value <= limit ? value : null;
}

/**
 * Arma la devolución con lo que escribió el personal: las unidades de cada línea y el motivo. Revisa lo que el servidor también
 * revisa (motivo, al menos una unidad, nunca más de lo pendiente) para avisar antes de enviar; sus reglas siguen mandando.
 */
export function buildReturn(
  lines: readonly ReturnableLine[],
  quantities: Readonly<Record<number, string>>,
  reason: string,
): ReturnDraft {
  const trimmed = reason.trim();
  if (trimmed === '') return { ok: false, problem: 'reasonRequired' };
  if (trimmed.length > REASON_MAX) return { ok: false, problem: 'reasonTooLong' };

  const chosen: { idOrderLine: number; quantity: number }[] = [];
  for (const line of lines) {
    const quantity = parseQuantity(quantities[line.idOrderLine] ?? '', pendingReturn(line));
    if (quantity === null) return { ok: false, problem: 'quantityInvalid' };
    if (quantity > 0) chosen.push({ idOrderLine: line.idOrderLine, quantity });
  }
  if (chosen.length === 0) return { ok: false, problem: 'nothingSelected' };
  return { ok: true, body: { reason: trimmed, lines: chosen } };
}
