// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  adjustmentSchema,
  entrySchema,
  inventoryParams,
  parseInventoryQuery,
} from '../../src/features/inventory/model/inventory';

const parse = (search: string) => parseInventoryQuery(new URLSearchParams(search));

describe('the inventory query', () => {
  it('starts with nothing chosen', () => {
    expect(parse('')).toEqual({ search: '', product: null, variant: null, page: 1 });
  });

  it('reads the text, the product, the variant and the page from the address', () => {
    expect(parse('q=%20tres%20leches%20&product=7&variant=21&page=3')).toEqual({
      search: 'tres leches',
      product: 7,
      variant: 21,
      page: 3,
    });
  });

  it('ignores a variant that comes without its product', () => {
    expect(parse('variant=21').variant).toBeNull();
  });

  it('falls back to the default for what it does not understand', () => {
    expect(parse('product=abc&page=0')).toEqual({
      search: '',
      product: null,
      variant: null,
      page: 1,
    });
    expect(parse('product=7&variant=-1&page=1.5')).toEqual({
      search: '',
      product: 7,
      variant: null,
      page: 1,
    });
  });

  it('writes only what is chosen and drops the page without a variant', () => {
    expect(inventoryParams({ search: '', product: null, variant: null, page: 1 }).toString()).toBe(
      '',
    );
    expect(inventoryParams({ search: 'a', product: 7, variant: null, page: 4 }).toString()).toBe(
      'q=a&product=7',
    );
    expect(inventoryParams({ search: 'a', product: 7, variant: 21, page: 4 }).toString()).toBe(
      'q=a&product=7&variant=21&page=4',
    );
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
