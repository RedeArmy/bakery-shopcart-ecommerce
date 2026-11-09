import { z } from 'zod';

/** Cuántos movimientos se ven por página del libro; el API admite hasta 100. */
export const PAGE_SIZE = 20;

/** Cuántos productos de la categoría se ven por página. */
export const PRODUCT_LIST_SIZE = 12;

export interface InventoryQuery {
  /** Categoría elegida, de la que se ven los productos */
  category: number | null;
  /** Página de la lista de productos de la categoría */
  list: number;
  /** Producto abierto, del que se ven las variantes */
  product: number | null;
  /** Variante elegida, de la que se ve el libro de movimientos */
  variant: number | null;
  /** Página del libro de movimientos */
  page: number;
}

const positiveInteger = (value: string | null): number | null => {
  if (value === null || !/^\d{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
};

/**
 * Lo que dice la dirección. Lo que no se entiende vuelve al valor por omisión en lugar de romper la pantalla. Un producto solo se
 * abre dentro de su categoría y una variante dentro de su producto: sin lo de arriba, lo de abajo no se muestra.
 */
export function parseInventoryQuery(params: URLSearchParams): InventoryQuery {
  const category = positiveInteger(params.get('category'));
  const product = category === null ? null : positiveInteger(params.get('product'));
  return {
    category,
    list: positiveInteger(params.get('list')) ?? 1,
    product,
    variant: product === null ? null : positiveInteger(params.get('variant')),
    page: positiveInteger(params.get('page')) ?? 1,
  };
}

/** La dirección para una consulta: solo lleva lo que se aparta del valor por omisión. */
export function inventoryParams(query: InventoryQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.category === null) return params;
  params.set('category', String(query.category));
  if (query.list > 1) params.set('list', String(query.list));
  if (query.product === null) return params;
  params.set('product', String(query.product));
  if (query.variant === null) return params;
  params.set('variant', String(query.variant));
  if (query.page > 1) params.set('page', String(query.page));
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
