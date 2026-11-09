// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  adjustmentSchema,
  entrySchema,
  inventoryParams,
  parseInventoryQuery,
} from '../../src/features/inventory/model/inventory';
import {
  emptyProduct,
  newProductSchema,
  productBody,
  variantBody,
} from '../../src/features/inventory/model/new-product';
import type {
  NewProductValues,
  NewVariantValues,
} from '../../src/features/inventory/model/new-product';
import { categoryChoices, choiceLabel } from '../../src/features/catalogue/model/categories';

const parse = (search: string) => parseInventoryQuery(new URLSearchParams(search));

describe('the inventory query', () => {
  it('starts with nothing chosen', () => {
    expect(parse('')).toEqual({ category: null, list: 1, product: null, variant: null, page: 1 });
  });

  it('reads the category, the list page, the product, the variant and the ledger page', () => {
    expect(parse('category=2&list=3&product=7&variant=21&page=4')).toEqual({
      category: 2,
      list: 3,
      product: 7,
      variant: 21,
      page: 4,
    });
  });

  it('ignores a product without its category and a variant without its product', () => {
    expect(parse('product=7&variant=21')).toMatchObject({
      category: null,
      product: null,
      variant: null,
    });
    expect(parse('category=2&variant=21')).toMatchObject({ product: null, variant: null });
  });

  it('falls back to the default for what it does not understand', () => {
    expect(parse('category=abc&list=0')).toEqual({
      category: null,
      list: 1,
      product: null,
      variant: null,
      page: 1,
    });
    expect(parse('category=2&product=7&variant=-1&page=1.5')).toEqual({
      category: 2,
      list: 1,
      product: 7,
      variant: null,
      page: 1,
    });
  });

  it('writes only what is chosen, from the top down', () => {
    const base = { category: null, list: 1, product: null, variant: null, page: 1 };
    expect(inventoryParams(base).toString()).toBe('');
    expect(inventoryParams({ ...base, product: 7, page: 4 }).toString()).toBe('');
    expect(inventoryParams({ ...base, category: 2, list: 3 }).toString()).toBe('category=2&list=3');
    expect(inventoryParams({ ...base, category: 2, product: 7, page: 4 }).toString()).toBe(
      'category=2&product=7',
    );
    expect(
      inventoryParams({ ...base, category: 2, product: 7, variant: 21, page: 4 }).toString(),
    ).toBe('category=2&product=7&variant=21&page=4');
  });
});

describe('the stock forms', () => {
  it('asks for a whole number above zero and a reason for an entry', () => {
    expect(entrySchema.safeParse({ amount: '12', reason: 'Llegó el pedido' }).success).toBe(true);
    expect(entrySchema.safeParse({ amount: '0', reason: 'x' }).success).toBe(false);
    expect(entrySchema.safeParse({ amount: '1.5', reason: 'x' }).success).toBe(false);
    expect(entrySchema.safeParse({ amount: '-3', reason: 'x' }).success).toBe(false);
    expect(entrySchema.safeParse({ amount: '5', reason: '   ' }).success).toBe(false);
  });

  it('lets a count be zero but never negative, and still asks for the reason', () => {
    expect(adjustmentSchema.safeParse({ amount: '0', reason: 'Se agotó' }).success).toBe(true);
    expect(adjustmentSchema.safeParse({ amount: '07', reason: 'x' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ amount: '-1', reason: 'x' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ amount: '4', reason: '' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ amount: '4', reason: 'a'.repeat(251) }).success).toBe(
      false,
    );
  });
});

describe('the categories to choose from', () => {
  const node = (id: number, name: string, children: unknown[] = []) => ({
    idCategory: id,
    name,
    children,
  });

  it('sorts them alphabetically, with their own below each one', () => {
    const choices = categoryChoices([
      node(3, 'Tartas', [node(5, 'Frutales'), node(6, 'Chocolate')]),
      node(1, 'Álamos'),
      node(2, 'Panes'),
    ] as never);

    expect(choices.map((choice) => choice.name)).toEqual([
      'Álamos',
      'Panes',
      'Tartas',
      'Chocolate',
      'Frutales',
    ]);
    expect(choices.map((choice) => choice.depth)).toEqual([0, 0, 0, 1, 1]);
    expect(choiceLabel(choices[0] as (typeof choices)[number])).toBe('Álamos');
    expect(choiceLabel(choices[3] as (typeof choices)[number])).toContain('↳ Chocolate');
  });
});

describe('the new product form', () => {
  const valid = (): NewProductValues => ({
    category: '2',
    name: 'Pastel de zanahoria',
    description: '',
    leadTimeDays: '2',
    sharedStock: false,
    initialUnits: '',
    variants: [
      {
        sku: 'ZAN-M',
        price: '95',
        attributeName: 'Tamaño',
        attributeValue: 'Mediano',
        unitsPerPack: '1',
        stock: '',
      },
    ],
  });

  const problems = (values: NewProductValues): string[] => {
    const result = newProductSchema.safeParse(values);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };

  it('starts with one empty variant and the category that is open', () => {
    expect(emptyProduct(4)).toMatchObject({ category: '4', leadTimeDays: '0' });
    expect(emptyProduct(4).variants).toHaveLength(1);
    expect(emptyProduct(null).category).toBe('');
  });

  it('accepts a complete product', () => {
    expect(problems(valid())).toEqual([]);
  });

  it('asks for the category, the name and the days', () => {
    expect(problems({ ...valid(), category: '' })).toContain('category');
    expect(problems({ ...valid(), name: '  ' })).toContain('name');
    expect(problems({ ...valid(), leadTimeDays: '256' })).toContain('leadTimeDays');
    expect(problems({ ...valid(), leadTimeDays: '-1' })).toContain('leadTimeDays');
    expect(problems({ ...valid(), name: 'a'.repeat(151) })).toContain('name');
    expect(problems({ ...valid(), description: 'a'.repeat(1001) })).toContain('description');
  });

  it('needs at least one variant, each with a code and a price above zero', () => {
    expect(problems({ ...valid(), variants: [] })).toContain('variants');
    const base = valid().variants[0] as NewVariantValues;
    expect(problems({ ...valid(), variants: [{ ...base, sku: '' }] })).toContain('variants.0.sku');
    expect(problems({ ...valid(), variants: [{ ...base, price: '0' }] })).toContain(
      'variants.0.price',
    );
    expect(problems({ ...valid(), variants: [{ ...base, price: 'abc' }] })).toContain(
      'variants.0.price',
    );
    expect(problems({ ...valid(), variants: [{ ...base, sku: 'a'.repeat(41) }] })).toContain(
      'variants.0.sku',
    );
  });

  it('does not accept the same code twice, whatever the case', () => {
    const base = valid().variants[0] as NewVariantValues;
    expect(
      problems({
        ...valid(),
        variants: [base, { ...base, sku: 'zan-m', attributeName: '', attributeValue: '' }],
      }),
    ).toContain('variants.1.sku');
  });

  it('wants the attribute name and its value together or neither', () => {
    const base = valid().variants[0] as NewVariantValues;
    expect(problems({ ...valid(), variants: [{ ...base, attributeValue: '' }] })).toContain(
      'variants.0.attributeValue',
    );
    expect(problems({ ...valid(), variants: [{ ...base, attributeName: '' }] })).toContain(
      'variants.0.attributeName',
    );
    expect(
      problems({ ...valid(), variants: [{ ...base, attributeName: '', attributeValue: '' }] }),
    ).toEqual([]);
  });

  it('checks the starting stock when it is given', () => {
    const base = valid().variants[0] as NewVariantValues;
    expect(problems({ ...valid(), variants: [{ ...base, stock: '12' }] })).toEqual([]);
    expect(problems({ ...valid(), variants: [{ ...base, stock: '0' }] })).toContain(
      'variants.0.stock',
    );
    expect(problems({ ...valid(), variants: [{ ...base, stock: '1.5' }] })).toContain(
      'variants.0.stock',
    );
  });

  it('builds the bodies the API expects', () => {
    const values = valid();
    expect(productBody(values)).toEqual({
      categoryId: 2,
      name: 'Pastel de zanahoria',
      description: null,
      leadTimeDays: 2,
    });
    expect(productBody({ ...values, description: 'Con nueces' }).description).toBe('Con nueces');
    expect(variantBody(9, values.variants[0] as NewVariantValues)).toEqual({
      productId: 9,
      sku: 'ZAN-M',
      price: '95.00',
      unitsPerPack: 1,
      stockVariantId: null,
      attributes: [{ name: 'Tamaño', value: 'Mediano' }],
    });
    // Un empaque que comparte la existencia lleva sus unidades y la variante de la que las toma
    expect(
      variantBody(9, values.variants[0] as NewVariantValues, {
        unitsPerPack: 6,
        stockVariantId: 4,
      }),
    ).toMatchObject({ unitsPerPack: 6, stockVariantId: 4 });
    expect(
      variantBody(9, {
        ...(values.variants[0] as NewVariantValues),
        attributeName: '',
        attributeValue: '',
      }),
    ).not.toHaveProperty('attributes');
  });
  describe('with the packagings sharing one stock', () => {
    const shared = (): NewProductValues => ({
      ...valid(),
      sharedStock: true,
      initialUnits: '600',
      variants: [
        { ...(valid().variants[0] as NewVariantValues), sku: 'CHA-12', unitsPerPack: '12' },
        { ...(valid().variants[0] as NewVariantValues), sku: 'CHA-06', unitsPerPack: '6' },
      ],
    });

    it('accepts the units of each packaging and the units the stock starts with', () => {
      expect(problems(shared())).toEqual([]);
    });

    it('asks for the units of every packaging, between 1 and 1000', () => {
      const [first, second] = shared().variants as [NewVariantValues, NewVariantValues];
      expect(
        problems({ ...shared(), variants: [{ ...first, unitsPerPack: '' }, second] }),
      ).toContain('variants.0.unitsPerPack');
      expect(
        problems({ ...shared(), variants: [first, { ...second, unitsPerPack: '0' }] }),
      ).toContain('variants.1.unitsPerPack');
      expect(
        problems({ ...shared(), variants: [first, { ...second, unitsPerPack: '1001' }] }),
      ).toContain('variants.1.unitsPerPack');
    });

    it('does not ask for the units per pack when the variants keep their own stock', () => {
      const [base] = valid().variants as [NewVariantValues];
      expect(problems({ ...valid(), variants: [{ ...base, unitsPerPack: '' }] })).toEqual([]);
    });

    it('checks the starting units of the shared stock', () => {
      expect(problems({ ...shared(), initialUnits: '' })).toEqual([]);
      expect(problems({ ...shared(), initialUnits: '0' })).toContain('initialUnits');
      expect(problems({ ...shared(), initialUnits: '2.5' })).toContain('initialUnits');
    });
  });
});
