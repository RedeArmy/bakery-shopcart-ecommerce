// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  groupByStock,
  looseUnits,
  packagingSchema,
  stockUnits,
  unitsPerPack,
  variantLabel,
  wholePacks,
} from '../../src/features/inventory/model/packaging';
import type { Variant } from '../../src/features/inventory/model/packaging';

const variant = (extra: Partial<Variant> = {}): Variant => ({
  idVariant: 1,
  sku: 'CHA-12',
  price: '35.00',
  ...extra,
});

describe('packs and loose units', () => {
  it('counts only whole packs: 54 units are 9 bags of 6, 50 are 8 and 2 are left over', () => {
    expect(wholePacks(54, 6)).toBe(9);
    expect(looseUnits(54, 6)).toBe(0);
    expect(wholePacks(50, 6)).toBe(8);
    expect(looseUnits(50, 6)).toBe(2);
  });

  it('gives 4 dozens and 6 loose units out of 54', () => {
    expect(wholePacks(54, 12)).toBe(4);
    expect(looseUnits(54, 12)).toBe(6);
  });

  it('has no whole pack when there are fewer units than the pack holds', () => {
    expect(wholePacks(5, 6)).toBe(0);
    expect(looseUnits(5, 6)).toBe(5);
    expect(wholePacks(0, 6)).toBe(0);
  });

  it('treats a single piece as a pack of one that never leaves anything over', () => {
    expect(wholePacks(54, 1)).toBe(54);
    expect(looseUnits(54, 1)).toBe(0);
  });

  it('reads the units per pack and the stock with a default for the older variants', () => {
    expect(unitsPerPack(variant())).toBe(1);
    expect(unitsPerPack(variant({ unitsPerPack: 6 }))).toBe(6);
    expect(stockUnits(variant())).toBe(0);
    expect(stockUnits(variant({ onHandStock: 54 }))).toBe(54);
  });
});

describe('the stock that packagings share', () => {
  it('puts the packagings that draw from the same stock in one group, in the order they come', () => {
    const groups = groupByStock([
      variant({ idVariant: 1, sku: 'DOZ', unitsPerPack: 12, idStockHolder: 1, onHandStock: 600 }),
      variant({ idVariant: 2, sku: 'BAG', unitsPerPack: 6, idStockHolder: 1, onHandStock: 600 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ holder: 1, units: 600, packaged: true });
    expect(groups[0]?.variants.map((item) => item.sku)).toEqual(['DOZ', 'BAG']);
  });

  it('keeps apart the variants that hold their own stock', () => {
    const groups = groupByStock([
      variant({ idVariant: 1, sku: 'S', idStockHolder: 1, onHandStock: 4 }),
      variant({ idVariant: 2, sku: 'L', idStockHolder: 2, onHandStock: 9 }),
    ]);

    expect(groups.map((group) => [group.holder, group.units, group.packaged])).toEqual([
      [1, 4, false],
      [2, 9, false],
    ]);
  });

  it('is a group of its own when a variant says nothing about the stock it draws from', () => {
    const [group] = groupByStock([variant({ idVariant: 7 })]);
    expect(group).toMatchObject({ holder: 7, packaged: false });
  });

  it('counts a single variant that brings several units as packaged', () => {
    const [group] = groupByStock([variant({ unitsPerPack: 12, onHandStock: 24 })]);
    expect(group?.packaged).toBe(true);
  });

  it('names a variant by its attributes and, without them, by its code', () => {
    expect(variantLabel(variant({ attributes: [{ name: 'Tamaño', value: 'Bolsa de 6' }] }))).toBe(
      'Bolsa de 6',
    );
    expect(variantLabel(variant())).toBe('CHA-12');
  });
});

describe('the form of a new packaging', () => {
  const valid = { name: 'Bolsa de 6', sku: 'CHA-06', price: '19', unitsPerPack: '6' };
  const problems = (values: Record<string, string>): string[] => {
    const result = packagingSchema.safeParse(values);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };

  it('accepts a name, a code, a price and the units it holds', () => {
    expect(problems(valid)).toEqual([]);
  });

  it('asks for every field', () => {
    expect(problems({ ...valid, name: ' ' })).toContain('name');
    expect(problems({ ...valid, sku: '' })).toContain('sku');
    expect(problems({ ...valid, price: '0' })).toContain('price');
    expect(problems({ ...valid, unitsPerPack: '' })).toContain('unitsPerPack');
  });

  it('keeps the units whole and between 1 and 1000', () => {
    expect(problems({ ...valid, unitsPerPack: '0' })).toContain('unitsPerPack');
    expect(problems({ ...valid, unitsPerPack: '1001' })).toContain('unitsPerPack');
    expect(problems({ ...valid, unitsPerPack: '2.5' })).toContain('unitsPerPack');
    expect(problems({ ...valid, unitsPerPack: '1000' })).toEqual([]);
  });

  it('limits the length of the name and of the code', () => {
    expect(problems({ ...valid, name: 'a'.repeat(61) })).toContain('name');
    expect(problems({ ...valid, sku: 'a'.repeat(41) })).toContain('sku');
  });
});
