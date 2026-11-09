import { isDateOnly, isReversedRange, todayText } from '../../../shared/lib/date';
import { ORDER_STATUSES } from '../../orders/model/order-status';

export type Granularity = 'day' | 'week' | 'month';
export const GRANULARITIES: readonly Granularity[] = ['day', 'week', 'month'];

/** Lo que se grafica de cada período: el monto vendido o el número de pedidos. */
export type Metric = 'amount' | 'orders';

/**
 * El período del panel. Un extremo en `null` lo decide el servidor: sin `to` es hoy en Guatemala y sin `from` son 29 días antes
 * de `to`. Así el navegador no calcula en qué día está la tienda.
 */
export interface DashboardRange {
  from: string | null;
  to: string | null;
}

export interface DashboardQuery extends DashboardRange {
  granularity: Granularity;
}

/** Los períodos que se ofrecen de un clic. */
export const PRESET_DAYS = [7, 30, 90] as const;

/** Lo que dice la dirección. Lo que no se entiende vuelve al valor por omisión en lugar de romper la pantalla. */
export function parseDashboardQuery(params: URLSearchParams): DashboardQuery {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const granularity = params.get('granularity');
  return {
    from: isDateOnly(from) ? from : null,
    to: isDateOnly(to) ? to : null,
    granularity: GRANULARITIES.find((item) => item === granularity) ?? 'day',
  };
}

/** La dirección para una consulta: solo lleva lo que se aparta del valor por omisión. */
export function dashboardParams(query: DashboardQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.from !== null) params.set('from', query.from);
  if (query.to !== null) params.set('to', query.to);
  if (query.granularity !== 'day') params.set('granularity', query.granularity);
  return params;
}

/** El período que el API recibe: solo los extremos que se eligieron. */
export const rangeParams = (range: DashboardRange): { from?: string; to?: string } => ({
  ...(range.from === null ? {} : { from: range.from }),
  ...(range.to === null ? {} : { to: range.to }),
});

export const isReversed = (range: DashboardRange): boolean => isReversedRange(range.from, range.to);

/** Los últimos `days` días contando hoy: desde hace `days - 1` días hasta hoy (el servidor sabe cuál es hoy). */
export function lastDays(days: number, now: Date = new Date()): DashboardRange {
  // El mediodía evita que un cambio de hora corra el día
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 12);
  return { from: todayText(start), to: null };
}

/** El preajuste que describe este período, o `null` si es uno elegido a mano. */
export function activePreset(range: DashboardRange, now: Date = new Date()): number | null {
  if (range.to !== null || range.from === null) return null;
  return PRESET_DAYS.find((days) => lastDays(days, now).from === range.from) ?? null;
}

/** Un importe del API como número, solo para dibujar su altura: lo que se lee en pantalla sigue siendo el texto del API. */
export const plotValue = (amount: string): number => {
  const value = Number(amount);
  return Number.isFinite(value) ? value : 0;
};

const dayLabel = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short' });
const monthLabel = new Intl.DateTimeFormat('es-GT', { month: 'short', year: 'numeric' });

/** El nombre corto de un período para el eje y la tabla: «10 jun» para un día o una semana (su lunes) y «jun 2030» para un mes. */
export function periodLabel(periodStart: string, granularity: Granularity): string {
  if (!isDateOnly(periodStart)) return periodStart;
  const [year = 0, month = 1, day = 1] = periodStart.split('-').map(Number);
  // En hora local y al mediodía, para que ninguna zona horaria corra el día
  const date = new Date(year, month - 1, day, 12);
  return (granularity === 'month' ? monthLabel : dayLabel).format(date);
}

/** El estado de un pedido tal como lo identifica el API, a partir de su nombre. */
export const statusId = (name: (typeof ORDER_STATUSES)[number]): number =>
  ORDER_STATUSES.indexOf(name) + 1;
