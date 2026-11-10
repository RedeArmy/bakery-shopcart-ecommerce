import { z } from 'zod';
import type { components } from '../../../shared/api/generated/schema';
import { toMoneyText } from '../../catalogue/model/catalogue-query';

export type Variant = components['schemas']['Variant'];

/** El nombre del atributo con el que el catálogo distingue los empaques (Bolsa de 6, Docena…). */
// cspell:disable-next-line
export const PACKAGING_ATTRIBUTE = 'Tamaño';

/** Las unidades que trae el empaque; las variantes anteriores a los empaques traen una. */
export const unitsPerPack = (variant: Variant): number => variant.unitsPerPack ?? 1;

/** Paquetes completos que caben en las unidades: 54 unidades son 9 de 6, y 50 son 8 porque el resto no completa un paquete. */
export const wholePacks = (units: number, perPack: number): number => Math.floor(units / perPack);

/** Las unidades que sobran y no completan un paquete. */
export const looseUnits = (units: number, perPack: number): number => units % perPack;

/** Las unidades de la existencia que ve una variante (compartida por todos los empaques del mismo grupo). */
export const stockUnits = (variant: Variant): number => variant.onHandStock ?? 0;

export interface StockGroup {
  /** La variante que guarda la existencia compartida */
  holder: number;
  /** Unidades en existencia, las mismas para todos los empaques del grupo */
  units: number;
  variants: Variant[];
  /** ¿Hay varios empaques o alguno trae más de una unidad? Entonces la existencia se explica en unidades y paquetes. */
  packaged: boolean;
}

/**
 * Agrupa las variantes por la existencia de la que toman: los empaques de un mismo producto que comparten unidades forman un grupo
 * y una variante que guarda la suya forma un grupo sola. Se conserva el orden en que llegan.
 */
export function groupByStock(variants: readonly Variant[]): StockGroup[] {
  const groups = new Map<number, StockGroup>();
  for (const variant of variants) {
    const holder = variant.idStockHolder ?? variant.idVariant;
    const group = groups.get(holder) ?? {
      holder,
      units: stockUnits(variant),
      variants: [],
      packaged: false,
    };
    group.variants.push(variant);
    group.packaged = group.variants.length > 1 || group.variants.some((v) => unitsPerPack(v) > 1);
    groups.set(holder, group);
  }
  return [...groups.values()];
}

/** Cómo se distingue una variante: sus atributos (tamaño, sabor…) y, si no tiene, su código. */
export const variantLabel = (variant: Variant): string => {
  const attributes = (variant.attributes ?? [])
    .map((attribute) => attribute.value)
    .filter((value): value is string => value !== undefined && value !== '');
  return attributes.length > 0 ? attributes.join(' · ') : variant.sku;
};

// Los mensajes son claves de i18n; los límites repiten los del API (SKU de 40, unidades de 1 a 1000): el servidor sigue decidiendo.
const V = 'inventory.packaging.validation';

/** Un empaque nuevo para una existencia compartida: cómo se llama, su código, su precio y cuántas unidades trae. */
export const packagingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: `${V}.name` })
    .max(60, { error: `${V}.nameTooLong` }),
  sku: z
    .string()
    .trim()
    .min(1, { error: `${V}.sku` })
    .max(40, { error: `${V}.skuTooLong` }),
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
  unitsPerPack: z
    .string()
    .trim()
    .refine((value) => /^\d{1,4}$/.test(value) && Number(value) >= 1 && Number(value) <= 1000, {
      error: `${V}.units`,
    }),
  /** La variante que guarda la existencia de la que toma el empaque nuevo */
  stock: z.string().min(1, { error: `${V}.stock` }),
});

export type PackagingValues = z.infer<typeof packagingSchema>;
