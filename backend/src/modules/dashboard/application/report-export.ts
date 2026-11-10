import type { Row } from '../../../platform/http/serialise.js';
import type { DashboardRepository, DateRange, Granularity } from './dashboard-repository.js';

export const REPORT_FORMATS = ['xlsx', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** Lo que dice una columna: cómo se alinea y cómo se escribe su valor (un importe es un número con formato de moneda). */
export type ColumnKind = 'text' | 'integer' | 'money';

export interface ReportColumn {
  title: string;
  kind: ColumnKind;
}

/** Una tabla del reporte. Los valores van como llegan del servidor: texto, y los importes con dos decimales (ADR-0020). */
export interface ReportSection {
  name: string;
  columns: readonly ReportColumn[];
  rows: readonly (readonly string[])[];
}

/** El reporte ya armado, listo para escribirse en cualquier formato. */
export interface Report {
  title: string;
  subtitle: string;
  generatedAt: Date;
  sections: readonly ReportSection[];
}

/** Escribe un reporte en un archivo. Es un puerto: el formato es un detalle de la infraestructura. */
export interface ReportWriter {
  write(report: Report): Buffer;
}

export type ReportWriters = Record<ReportFormat, ReportWriter>;

const text = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
};

const pick = (row: Row, keys: readonly string[]): string[] => keys.map((key) => text(row[key]));

/** Cuántos productos lleva el reporte por omisión: los mismos diez que muestra el panel. */
export const DEFAULT_TOP = 10;

/**
 * Reúne los mismos cuatro reportes que muestra el panel (resumen, ventas por período, por categoría y más vendidos) para un
 * período. Pasa por el repositorio, así que usa el caché: exportar no recalcula lo que el panel ya calculó.
 */
export async function collectReport(
  repository: DashboardRepository,
  range: DateRange,
  granularity: Granularity,
  top: number,
  generatedAt: Date,
): Promise<Report> {
  const [summary, sales, categories, products] = await Promise.all([
    repository.summary(range),
    repository.salesByPeriod(range, granularity),
    repository.salesByCategory(range),
    repository.topProducts(range, top),
  ]);

  const from = text(summary['fromDate']);
  const to = text(summary['toDate']);
  const kpi = (label: string, key: string): string[] => [label, text(summary[key])];

  return {
    title: 'Reporte de ventas',
    subtitle: `Del ${from} al ${to}`,
    generatedAt,
    sections: [
      {
        name: 'Resumen',
        columns: [
          { title: 'Indicador', kind: 'text' },
          { title: 'Valor', kind: 'text' },
        ],
        rows: [
          kpi('Pedidos pagados', 'orders'),
          kpi('Venta bruta (Q)', 'gross'),
          kpi('Devuelto (Q)', 'returned'),
          kpi('Venta neta (Q)', 'net'),
          kpi('Ticket promedio (Q)', 'averageTicket'),
          kpi('Pedidos esperando pago', 'pendingPaymentOrders'),
          kpi('Depósitos en revisión', 'depositsUnderReview'),
          kpi('Carritos abandonados', 'abandonedCarts'),
        ],
      },
      {
        name: 'Ventas por período',
        columns: [
          { title: 'Período', kind: 'text' },
          { title: 'Pedidos', kind: 'integer' },
          { title: 'Bruto', kind: 'money' },
          { title: 'Devuelto', kind: 'money' },
          { title: 'Neto', kind: 'money' },
          { title: 'Ticket promedio', kind: 'money' },
        ],
        rows: sales.map((row) =>
          pick(row, ['periodStart', 'orders', 'gross', 'returned', 'net', 'averageTicket']),
        ),
      },
      {
        name: 'Ventas por categoría',
        columns: [
          { title: 'Categoría', kind: 'text' },
          { title: 'Pedidos', kind: 'integer' },
          { title: 'Unidades', kind: 'integer' },
          { title: 'Neto', kind: 'money' },
        ],
        rows: categories.map((row) => pick(row, ['categoryName', 'orders', 'units', 'net'])),
      },
      {
        name: 'Más vendidos',
        columns: [
          { title: '#', kind: 'integer' },
          { title: 'Producto', kind: 'text' },
          { title: 'Unidades', kind: 'integer' },
          { title: 'Neto', kind: 'money' },
        ],
        rows: products.map((row) => pick(row, ['position', 'productName', 'units', 'net'])),
      },
    ],
  };
}
