import type { paths } from '../../../shared/api/generated/schema';

export const SORTS = ['name', 'price_asc', 'price_desc', 'newest'] as const;
export type Sort = (typeof SORTS)[number];

/** Tarjetas por página: múltiplo de las columnas de la cuadrícula (2, 3 y 4) para que no quede una fila coja. */
export const PAGE_SIZE = 12;

/** Con tan pocas unidades la tarjeta avisa; es solo una pista visual, la existencia real la dicta el servidor. */
export const LOW_STOCK_THRESHOLD = 5;

export interface CatalogueQuery {
  q: string;
  category: number | null;
  /** Importes como texto con dos decimales, igual que el API (ADR-0020) */
  min: string | null;
  max: string | null;
  available: boolean;
  sort: Sort;
  page: number;
}

export const DEFAULT_QUERY: CatalogueQuery = {
  q: '',
  category: null,
  min: null,
  max: null,
  available: false,
  sort: 'name',
  page: 1,
};

const positiveInteger = (value: string | null): number | null => {
  if (value === null || !/^\d{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
};

/**
 * Convierte lo que escribe el cliente en un importe válido para el API sin pasar por `number`: "100" → "100.00",
 * "99,5" → "99.50". Devuelve null si no es un importe, y esa casilla simplemente no filtra.
 */
export function toMoneyText(input: string): string | null {
  const text = input.trim().replace(',', '.');
  if (/^\d{1,16}$/.test(text)) return `${text}.00`;
  if (/^\d{1,16}\.\d$/.test(text)) return `${text}0`;
  if (/^\d{1,16}\.\d{2}$/.test(text)) return text;
  return null;
}

/** El estado del catálogo vive en la dirección: un enlace compartido muestra exactamente la misma búsqueda. */
export function parseQuery(params: URLSearchParams): CatalogueQuery {
  const sort = params.get('sort');
  return {
    q: params.get('q')?.trim() ?? '',
    category: positiveInteger(params.get('category')),
    min: toMoneyText(params.get('min') ?? ''),
    max: toMoneyText(params.get('max') ?? ''),
    available: params.get('available') === 'true',
    sort: SORTS.find((candidate) => candidate === sort) ?? DEFAULT_QUERY.sort,
    page: positiveInteger(params.get('page')) ?? 1,
  };
}

/** Solo se escribe lo que se aparta del valor por defecto, para que la dirección quede corta. */
export function toSearchParams(query: CatalogueQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== '') params.set('q', query.q);
  if (query.category !== null) params.set('category', String(query.category));
  if (query.min !== null) params.set('min', query.min);
  if (query.max !== null) params.set('max', query.max);
  if (query.available) params.set('available', 'true');
  if (query.sort !== DEFAULT_QUERY.sort) params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

/** Cambiar un filtro devuelve a la primera página: la página 5 de otra búsqueda no tiene sentido. */
export function withFilter(
  query: CatalogueQuery,
  change: Partial<Omit<CatalogueQuery, 'page'>>,
): CatalogueQuery {
  return { ...query, ...change, page: 1 };
}

export type ProductsApiQuery = NonNullable<paths['/api/v1/products']['get']['parameters']['query']>;

export function toApiQuery(query: CatalogueQuery, size = PAGE_SIZE): ProductsApiQuery {
  return {
    ...(query.q === '' ? {} : { q: query.q }),
    ...(query.category === null ? {} : { category: query.category }),
    ...(query.min === null ? {} : { min: query.min }),
    ...(query.max === null ? {} : { max: query.max }),
    ...(query.available ? { available: true } : {}),
    sort: query.sort,
    page: query.page,
    size,
  };
}

export type StockState = 'soldOut' | 'low' | 'ok';

export function stockState(available: number): StockState {
  if (available <= 0) return 'soldOut';
  return available <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export const hasActiveFilters = (query: CatalogueQuery): boolean =>
  query.q !== '' ||
  query.category !== null ||
  query.min !== null ||
  query.max !== null ||
  query.available;
