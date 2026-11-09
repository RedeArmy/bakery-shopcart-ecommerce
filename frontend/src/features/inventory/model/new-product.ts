import { z } from 'zod';
import { toMoneyText } from '../../catalogue/model/catalogue-query';

// Los mensajes son claves de i18n; los límites repiten los del API (docs/api/openapi): el servidor sigue decidiendo.
const V = 'inventory.create.validation';

/** Un atributo que distingue a la variante (tamaño, sabor…): nombre y valor van juntos o no van. */
const variantSchema = z
  .object({
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
    attributeName: z
      .string()
      .trim()
      .max(50, { error: `${V}.tooLong` }),
    attributeValue: z
      .string()
      .trim()
      .max(100, { error: `${V}.tooLong` }),
    /** Unidades con las que empieza; vacío es sin stock todavía */
    stock: z
      .string()
      .trim()
      .refine((value) => value === '' || /^[1-9]\d{0,5}$/.test(value), { error: `${V}.stock` }),
  })
  .superRefine((variant, context) => {
    if (variant.attributeName === '' && variant.attributeValue !== '') {
      context.addIssue({ code: 'custom', path: ['attributeName'], message: `${V}.attributePair` });
    }
    if (variant.attributeName !== '' && variant.attributeValue === '') {
      context.addIssue({ code: 'custom', path: ['attributeValue'], message: `${V}.attributePair` });
    }
  });

/**
 * Un producto nuevo tal como se escribe en el formulario: todo texto. Un producto sin variantes no se puede vender ni tener
 * stock, así que se crea con al menos una; los códigos (SKU) no se pueden repetir entre ellas.
 */
export const newProductSchema = z
  .object({
    category: z.string().min(1, { error: `${V}.category` }),
    name: z
      .string()
      .trim()
      .min(1, { error: `${V}.name` })
      .max(150, { error: `${V}.nameTooLong` }),
    description: z
      .string()
      .trim()
      .max(1000, { error: `${V}.descriptionTooLong` }),
    leadTimeDays: z
      .string()
      .trim()
      .refine((value) => /^\d{1,3}$/.test(value) && Number(value) <= 255, {
        error: `${V}.leadTime`,
      }),
    variants: z.array(variantSchema).min(1, { error: `${V}.variantsRequired` }),
  })
  .superRefine((product, context) => {
    const seen = new Set<string>();
    product.variants.forEach((variant, index) => {
      const key = variant.sku.toLowerCase();
      if (key !== '' && seen.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['variants', index, 'sku'],
          message: `${V}.skuRepeated`,
        });
      }
      seen.add(key);
    });
  });

export type NewProductValues = z.infer<typeof newProductSchema>;
export type NewVariantValues = NewProductValues['variants'][number];

export const EMPTY_VARIANT: NewVariantValues = {
  sku: '',
  price: '',
  attributeName: '',
  attributeValue: '',
  stock: '',
};

/** Lo que se ofrece al empezar: una variante vacía, para que el formulario ya muestre dónde va el precio. */
export const emptyProduct = (category: number | null): NewProductValues => ({
  category: category === null ? '' : String(category),
  name: '',
  description: '',
  leadTimeDays: '0',
  variants: [{ ...EMPTY_VARIANT }],
});

/** El cuerpo del producto: la descripción vacía viaja como nula. */
export const productBody = (values: NewProductValues) => ({
  categoryId: Number(values.category),
  name: values.name,
  description: values.description === '' ? null : values.description,
  leadTimeDays: Number(values.leadTimeDays),
});

/** El cuerpo de una variante: el precio como texto con dos decimales (ADR-0020) y el atributo solo si se escribió. */
export const variantBody = (idProduct: number, variant: NewVariantValues) => ({
  productId: idProduct,
  sku: variant.sku,
  price: toMoneyText(variant.price) ?? variant.price,
  ...(variant.attributeName === ''
    ? {}
    : { attributes: [{ name: variant.attributeName, value: variant.attributeValue }] }),
});
