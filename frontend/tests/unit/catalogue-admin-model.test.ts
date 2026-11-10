// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  categoryBody,
  categorySchema,
  categoryValuesOf,
  maintenanceParams,
  orderCategories,
  parseMaintenanceQuery,
  priceSchema,
  productBody,
  productSchema,
  productValuesOf,
} from '../../src/features/catalogue-admin/model/maintenance';
import type {
  Category,
  CategoryValues,
  ProductSummary,
  ProductValues,
} from '../../src/features/catalogue-admin/model/maintenance';

const parse = (search: string) => parseMaintenanceQuery(new URLSearchParams(search));

describe('the maintenance query', () => {
  it('starts on the categories', () => {
    expect(parse('')).toEqual({ view: 'categories', category: null, page: 1 });
  });

  it('reads the view, the category and the page from the address', () => {
    expect(parse('view=products&category=3&page=2')).toEqual({
      view: 'products',
      category: 3,
      page: 2,
    });
  });

  it('falls back to the default for what it does not understand', () => {
    expect(parse('view=other&category=abc&page=0')).toEqual({
      view: 'categories',
      category: null,
      page: 1,
    });
  });

  it('writes only what counts for the view', () => {
    const base = { view: 'categories', category: 3, page: 2 } as const;
    expect(maintenanceParams(base).toString()).toBe('');
    expect(maintenanceParams({ ...base, view: 'products', category: null }).toString()).toBe(
      'view=products',
    );
    expect(maintenanceParams({ ...base, view: 'products' }).toString()).toBe(
      'view=products&category=3&page=2',
    );
    expect(maintenanceParams({ ...base, view: 'products', page: 1 }).toString()).toBe(
      'view=products&category=3',
    );
  });
});

describe('the order of the categories', () => {
  const category = (
    idCategory: number,
    name: string,
    idParentCategory: number | null = null,
  ): Category => ({
    idCategory,
    name,
    idParentCategory,
  });

  it('puts the main ones in alphabetical order and each one’s own below it', () => {
    const ordered = orderCategories([
      category(1, 'Tartas'),
      category(2, 'Frutales', 1),
      category(3, 'Chocolate', 1),
      category(4, 'Álamos'),
      category(5, 'Panes'),
    ]);

    expect(ordered.map((item) => [item.category.name, item.depth])).toEqual([
      ['Álamos', 0],
      ['Panes', 0],
      ['Tartas', 0],
      ['Chocolate', 1],
      ['Frutales', 1],
    ]);
  });

  it('goes as deep as the tree does', () => {
    const ordered = orderCategories([category(1, 'A'), category(2, 'B', 1), category(3, 'C', 2)]);
    expect(ordered.map((item) => item.depth)).toEqual([0, 1, 2]);
  });

  it('treats a category whose parent is not in the list as a main one, so it is never lost', () => {
    const ordered = orderCategories([category(2, 'Huérfana', 99)]);
    expect(ordered).toHaveLength(1);
    expect(ordered[0]).toMatchObject({ depth: 0 });
  });

  it('is empty without categories', () => {
    expect(orderCategories([])).toEqual([]);
  });
});

describe('the category form', () => {
  const problems = (values: CategoryValues): string[] => {
    const result = categorySchema.safeParse(values);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };
  const valid: CategoryValues = { name: 'Panes', description: '', parent: '' };

  it('asks for a name of at most 80 characters and a description of at most 300', () => {
    expect(problems(valid)).toEqual([]);
    expect(problems({ ...valid, name: '  ' })).toContain('name');
    expect(problems({ ...valid, name: 'a'.repeat(81) })).toContain('name');
    expect(problems({ ...valid, description: 'a'.repeat(301) })).toContain('description');
  });

  it('sends what was left empty as null', () => {
    expect(categoryBody(valid)).toEqual({ name: 'Panes', description: null, parentId: null });
    expect(categoryBody({ name: 'Frutales', description: 'De temporada', parent: '4' })).toEqual({
      name: 'Frutales',
      description: 'De temporada',
      parentId: 4,
    });
  });

  it('fills the form with what the category already has', () => {
    expect(
      categoryValuesOf({ idCategory: 2, name: 'Frutales', description: null, idParentCategory: 4 }),
    ).toEqual({ name: 'Frutales', description: '', parent: '4' });
    expect(categoryValuesOf({ idCategory: 1, name: 'Panes' }).parent).toBe('');
  });
});

describe('the product form', () => {
  const valid: ProductValues = {
    category: '2',
    name: 'Pastel de zanahoria',
    description: '',
    leadTimeDays: '2',
  };
  const problems = (values: ProductValues): string[] => {
    const result = productSchema.safeParse(values);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };

  it('accepts a complete product', () => {
    expect(problems(valid)).toEqual([]);
  });

  it('asks for the category, the name and the days', () => {
    expect(problems({ ...valid, category: '' })).toContain('category');
    expect(problems({ ...valid, name: ' ' })).toContain('name');
    expect(problems({ ...valid, name: 'a'.repeat(151) })).toContain('name');
    expect(problems({ ...valid, description: 'a'.repeat(1001) })).toContain('description');
    expect(problems({ ...valid, leadTimeDays: '256' })).toContain('leadTimeDays');
    expect(problems({ ...valid, leadTimeDays: '-1' })).toContain('leadTimeDays');
    expect(problems({ ...valid, leadTimeDays: '0' })).toEqual([]);
  });

  it('sends the empty description as null', () => {
    expect(productBody(valid)).toEqual({
      categoryId: 2,
      name: 'Pastel de zanahoria',
      description: null,
      leadTimeDays: 2,
    });
    expect(productBody({ ...valid, description: 'Con nueces' }).description).toBe('Con nueces');
  });

  it('fills the form with what the product already has', () => {
    const product: ProductSummary = {
      idProduct: 7,
      idCategory: 2,
      name: 'Pastel',
      description: null,
      leadTimeDays: 3,
      minPrice: '10.00',
      maxPrice: '20.00',
    };
    expect(productValuesOf(product)).toEqual({
      category: '2',
      name: 'Pastel',
      description: '',
      leadTimeDays: '3',
    });
  });
});

describe('the price form', () => {
  it('wants an amount above zero', () => {
    expect(priceSchema.safeParse({ price: '19' }).success).toBe(true);
    expect(priceSchema.safeParse({ price: '19,5' }).success).toBe(true);
    expect(priceSchema.safeParse({ price: '0' }).success).toBe(false);
    expect(priceSchema.safeParse({ price: 'abc' }).success).toBe(false);
    expect(priceSchema.safeParse({ price: '' }).success).toBe(false);
  });
});
