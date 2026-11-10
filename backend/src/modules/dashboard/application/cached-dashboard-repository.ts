import type { Page, Row } from '../../../platform/http/serialise.js';
import type { DashboardRepository } from './dashboard-repository.js';

export interface ReportCacheOptions {
  /** Cuánto vale como máximo un reporte guardado, aunque los datos no cambien: cubre lo que depende del paso del tiempo. */
  ttlMs: number;
  /** Cuántos reportes distintos se guardan; al llenarse sale el más antiguo. */
  maxEntries: number;
  now: () => number;
}

export const DEFAULT_REPORT_CACHE: Omit<ReportCacheOptions, 'now'> = {
  ttlMs: 60_000,
  maxEntries: 200,
};

interface Entry {
  version: string;
  at: number;
  value: Promise<unknown>;
}

/**
 * Guarda en memoria lo que responde el panel. Cada reporte vale mientras no cambie la marca de versión de los datos
 * (`dataVersion`, una lectura barata de la base de datos) y no pase el tiempo de vida: un pedido nuevo, un pago, una devolución
 * o un cambio de catálogo cambian la marca y el reporte se calcula otra vez en la siguiente petición. Dos peticiones iguales a
 * la vez comparten un solo cálculo, y un cálculo que falla no se guarda.
 */
export function createCachedDashboardRepository(
  inner: DashboardRepository,
  options: ReportCacheOptions,
): DashboardRepository {
  const entries = new Map<string, Entry>();

  async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const version = await inner.dataVersion();
    const now = options.now();
    const hit = entries.get(key);
    if (hit?.version === version && now - hit.at < options.ttlMs) return (await hit.value) as T;

    const value = compute();
    entries.delete(key);
    entries.set(key, { version, at: now, value });
    // Sale el más antiguo; un cálculo que falla no se queda guardado para la siguiente petición
    if (entries.size > options.maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done !== true) entries.delete(oldest.value);
    }
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    return value;
  }

  return {
    summary: (range) => cached(`summary|${JSON.stringify(range)}`, () => inner.summary(range)),
    salesByPeriod: (range, granularity) =>
      cached(`sales|${JSON.stringify(range)}|${granularity}`, () =>
        inner.salesByPeriod(range, granularity),
      ),
    salesByCategory: (range) =>
      cached(`categories|${JSON.stringify(range)}`, () => inner.salesByCategory(range)),
    topProducts: (range, top) =>
      cached(`top|${JSON.stringify(range)}|${String(top)}`, () => inner.topProducts(range, top)),
    abandonedCarts: (page, size) =>
      cached<Page<Row>>(`abandoned|${String(page)}|${String(size)}`, () =>
        inner.abandonedCarts(page, size),
      ),
    dataVersion: () => inner.dataVersion(),
  };
}
