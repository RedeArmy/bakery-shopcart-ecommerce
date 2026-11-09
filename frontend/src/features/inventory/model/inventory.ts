import { z } from 'zod';

/** Cuántos movimientos se ven por página del libro; el API admite hasta 100. */
export const PAGE_SIZE = 20;

/** Cuántos productos se ofrecen al buscar: pocos, para elegir uno y seguir. */
export const PRODUCT_CHOICES = 8;

export interface InventoryQuery {
  /** Texto con el que se busca el producto */
  search: string;
  /** Producto elegido, del que se ven las variantes */
  product: number | null;
  /** Variante elegida, de la que se ve el libro de movimientos */
  variant: number | null;
  page: number;
}

const positiveInteger = (value: string | null): number | null => {
  if (value === null || !/^\d{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
};

/** Lo que dice la dirección. Lo que no se entiende vuelve al valor por omisión en lugar de romper la pantalla. */
export function parseInventoryQuery(params: URLSearchParams): InventoryQuery {
  const product = positiveInteger(params.get('product'));
  return {
    search: (params.get('q') ?? '').trim().slice(0, 100),
    product,
    // Una variante sin producto no se muestra: se llega a ella desde el producto
    variant: product === null ? null : positiveInteger(params.get('variant')),
    page: positiveInteger(params.get('page')) ?? 1,
  };
}

/** La dirección para una consulta: solo lleva lo que se aparta del valor por omisión. */
export function inventoryParams(query: InventoryQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search !== '') params.set('q', query.search);
  if (query.product !== null) params.set('product', String(query.product));
  if (query.product !== null && query.variant !== null) {
    params.set('variant', String(query.variant));
    if (query.page > 1) params.set('page', String(query.page));
  }
  return params;
}

// Los mensajes son claves de i18n; los límites repiten los del API (el motivo, 250 caracteres): el servidor sigue decidiendo.
const reason = z
  .string()
  .trim()
  .min(1, { error: 'inventory.validation.reasonRequired' })
  .max(250, { error: 'inventory.validation.reasonTooLong' });

/** Unidades que llegaron: un entero mayor que cero y el motivo. */
export const entrySchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^[1-9]\d{0,5}$/, { error: 'inventory.validation.quantity' }),
  reason,
});

/** El conteo físico: cuántas unidades hay ahora (puede ser cero) y el motivo. */
export const adjustmentSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^(0|[1-9]\d{0,5})$/, { error: 'inventory.validation.count' }),
  reason,
});
