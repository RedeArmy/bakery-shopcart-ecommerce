import type { Page, Row } from '../../../platform/http/serialise.js';

export type Granularity = 'day' | 'week' | 'month';

/** Rango en días de Guatemala; sin fechas, la base de datos usa los últimos 30 días. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

/**
 * Puerto de datos del panel (RF-08). Todo se calcula en la base de datos: importes en centavos enteros, descuento de
 * devoluciones, ticket promedio con redondeo half-even y agrupación por fecha de pago en hora de Guatemala (ADR-0009).
 */
export interface DashboardRepository {
  summary(range: DateRange): Promise<Row>;
  salesByPeriod(range: DateRange, granularity: Granularity): Promise<Row[]>;
  salesByCategory(range: DateRange): Promise<Row[]>;
  topProducts(range: DateRange, top: number): Promise<Row[]>;
  abandonedCarts(page: number, size: number): Promise<Page<Row>>;
}
