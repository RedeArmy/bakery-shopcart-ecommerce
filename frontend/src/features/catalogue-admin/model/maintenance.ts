import { z } from 'zod';
import type { components } from '../../../shared/api/generated/schema';
import { toMoneyText } from '../../catalogue/model/catalogue-query';

export type Category = components['schemas']['Category'];
export type ProductSummary = components['schemas']['ProductSummary'];

/** Cuántos productos se ven por página. */
export const PRODUCT_PAGE_SIZE = 12;

export const VIEWS = ['categories', 'products'] as const;
export type View = (typeof VIEWS)[number];

export interface MaintenanceQuery {
  view: View;
  /** Categoría de la que se ven los productos */
  category: number | null;
  page: number;
}

const positiveInteger = (value: string | null): number | null => {
  if (value === null || !/^\d{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
};

/** Lo que dice la dirección. Lo que no se entiende vuelve al valor por omisión en lugar de romper la pantalla. */
export function parseMaintenanceQuery(params: URLSearchParams): MaintenanceQuery {
  const view = params.get('view');
  return {
    view: VIEWS.find((candidate) => candidate === view) ?? 'categories',
    category: positiveInteger(params.get('category')),
    page: positiveInteger(params.get('page')) ?? 1,
  };
}

/** La dirección para una consulta: la categoría y la página solo cuentan en la vista de productos. */
export function maintenanceParams(query: MaintenanceQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.view === 'categories') return params;
  params.set('view', 'products');
  if (query.category === null) return params;
  params.set('category', String(query.category));
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

export interface OrderedCategory {
  category: Category;
  /** 0 para una categoría principal; 1 o más para las que cuelgan de otra */
  depth: number;
}

const byName = (a: Category, b: Category): number =>
  (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' });

/**
 * La lista plana de categorías (activas o no) en el orden en que se leen: cada principal por orden alfabético y, debajo, las suyas
 * también por orden alfabético. Una categoría cuyo padre no está en la lista se trata como principal, para que nunca se pierda.
 */
export function orderCategories(flat: readonly Category[]): OrderedCategory[] {
  const ids = new Set(flat.map((category) => category.idCategory));
  const childrenOf = (parent: number | null): Category[] =>
    flat
      .filter((category) =>
        parent === null
          ? category.idParentCategory == null || !ids.has(category.idParentCategory)
          : category.idParentCategory === parent,
      )
      .sort(byName);
  const walk = (parent: number | null, depth: number): OrderedCategory[] =>
    childrenOf(parent).flatMap((category) => [
      { category, depth },
      ...walk(category.idCategory ?? null, depth + 1),
    ]);
  return walk(null, 0);
}

// Los mensajes son claves de i18n; los límites repiten los de la base de datos: el servidor sigue decidiendo.
const V = 'catalogueAdmin.validation';

/** Una categoría: su nombre (único), una descripción opcional y de cuál cuelga, si de alguna. */
export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: `${V}.categoryName` })
    .max(80, { error: `${V}.categoryNameTooLong` }),
  description: z
    .string()
    .trim()
    .max(300, { error: `${V}.categoryDescriptionTooLong` }),
  parent: z.string().trim(),
});
export type CategoryValues = z.infer<typeof categorySchema>;

export const EMPTY_CATEGORY: CategoryValues = { name: '', description: '', parent: '' };

export const categoryValuesOf = (category: Category): CategoryValues => ({
  name: category.name ?? '',
  description: category.description ?? '',
  parent: category.idParentCategory == null ? '' : String(category.idParentCategory),
});

/** El cuerpo de una categoría: lo que se deja vacío (descripción, padre) viaja como nulo. */
export const categoryBody = (values: CategoryValues) => ({
  name: values.name,
  description: values.description === '' ? null : values.description,
  parentId: values.parent === '' ? null : Number(values.parent),
});

/** Un producto: su categoría, su nombre, su descripción y los días de preparación (0 se vende de inmediato). */
export const productSchema = z.object({
  category: z.string().min(1, { error: `${V}.productCategory` }),
  name: z
    .string()
    .trim()
    .min(1, { error: `${V}.productName` })
    .max(150, { error: `${V}.productNameTooLong` }),
  description: z
    .string()
    .trim()
    .max(1000, { error: `${V}.productDescriptionTooLong` }),
  leadTimeDays: z
    .string()
    .trim()
    .refine((value) => /^\d{1,3}$/.test(value) && Number(value) <= 255, {
      error: `${V}.leadTime`,
    }),
});
export type ProductValues = z.infer<typeof productSchema>;

export const productValuesOf = (product: ProductSummary): ProductValues => ({
  category: product.idCategory === undefined ? '' : String(product.idCategory),
  name: product.name,
  description: product.description ?? '',
  leadTimeDays: String(product.leadTimeDays ?? 0),
});

/** El cuerpo de un producto: la descripción vacía viaja como nula. */
export const productBody = (values: ProductValues) => ({
  categoryId: Number(values.category),
  name: values.name,
  description: values.description === '' ? null : values.description,
  leadTimeDays: Number(values.leadTimeDays),
});

/** El precio nuevo de una variante: un importe mayor que cero, que viaja como texto con dos decimales (ADR-0020). */
export const priceSchema = z.object({
  price: z
    .string()
    .trim()
    .refine(
      (value) => {
        const money = toMoneyText(value);
        return money !== null && Number(money) > 0;
      },
      { error: `${V}.price` },
    ),
});
export type PriceValues = z.infer<typeof priceSchema>;
