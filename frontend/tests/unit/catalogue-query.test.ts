// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUERY,
  PAGE_SIZE,
  hasActiveFilters,
  pageCount,
  parseQuery,
  stockState,
  toApiQuery,
  toMoneyText,
  toSearchParams,
  withFilter,
} from '../../src/features/catalogue/model/catalogue-query';

describe('toMoneyText', () => {
  it.each([
    ['100', '100.00'],
    ['99.5', '99.50'],
    ['99,5', '99.50'],
    ['12.34', '12.34'],
    ['  7  ', '7.00'],
    ['0', '0.00'],
  ])('turns %j into %j without going through a number', (input, expected) => {
    expect(toMoneyText(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '-5', '1e3', '12.', '.5', '1,2,3', '12345678901234567'])(
    'rejects %j',
    (input) => {
      expect(toMoneyText(input)).toBeNull();
    },
  );
});

describe('parseQuery and toSearchParams', () => {
  it('reads the default query from an empty address', () => {
    expect(parseQuery(new URLSearchParams())).toEqual(DEFAULT_QUERY);
  });

  it('reads every filter from the address', () => {
    const params = new URLSearchParams(
      'q=%20tres%20leches%20&category=3&min=100&max=250.5&available=true&sort=price_desc&page=2',
    );
    expect(parseQuery(params)).toEqual({
      q: 'tres leches',
      category: 3,
      min: '100.00',
      max: '250.50',
      available: true,
      sort: 'price_desc',
      page: 2,
    });
  });

  it('falls back to the defaults for anything invalid or manipulated', () => {
    const params = new URLSearchParams(
      'category=-1&min=abc&max=1e9&available=yes&sort=drop%20table&page=0',
    );
    expect(parseQuery(params)).toEqual(DEFAULT_QUERY);
    expect(parseQuery(new URLSearchParams('page=abc&category=1.5')).page).toBe(1);
  });

  it('writes only what differs from the defaults, so the address stays short', () => {
    expect(toSearchParams(DEFAULT_QUERY).toString()).toBe('');
    expect(
      toSearchParams({
        ...DEFAULT_QUERY,
        q: 'pastel',
        category: 2,
        sort: 'newest',
        page: 3,
      }).toString(),
    ).toBe('q=pastel&category=2&sort=newest&page=3');
  });

  it('round-trips through the address', () => {
    const query = {
      q: 'café',
      category: 4,
      min: '10.00',
      max: '99.99',
      available: true,
      sort: 'price_asc' as const,
      page: 5,
    };
    expect(parseQuery(toSearchParams(query))).toEqual(query);
  });
});

describe('withFilter', () => {
  it('goes back to the first page when a filter changes', () => {
    expect(withFilter({ ...DEFAULT_QUERY, page: 4 }, { category: 2 })).toMatchObject({
      category: 2,
      page: 1,
    });
  });
});

describe('toApiQuery', () => {
  it('sends only the filters that are set, with the page and the size', () => {
    expect(toApiQuery(DEFAULT_QUERY)).toEqual({ sort: 'name', page: 1, size: PAGE_SIZE });
    expect(
      toApiQuery(
        { ...DEFAULT_QUERY, q: 'x', category: 2, min: '1.00', max: '9.00', available: true },
        4,
      ),
    ).toEqual({
      q: 'x',
      category: 2,
      min: '1.00',
      max: '9.00',
      available: true,
      sort: 'name',
      page: 1,
      size: 4,
    });
  });

  it('never sends the amounts as numbers', () => {
    const api = toApiQuery({ ...DEFAULT_QUERY, min: '100.00', max: '250.50' });
    expect(typeof api.min).toBe('string');
    expect(typeof api.max).toBe('string');
  });
});

describe('stock, pages and active filters', () => {
  it.each([
    [0, 'soldOut'],
    [-1, 'soldOut'],
    [1, 'low'],
    [5, 'low'],
    [6, 'ok'],
  ] as const)('shows %i units as %s', (units, expected) => {
    expect(stockState(units)).toBe(expected);
  });

  it('counts at least one page and rounds up', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
    expect(pageCount(60)).toBe(5);
  });

  it('knows when a filter is on', () => {
    expect(hasActiveFilters(DEFAULT_QUERY)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_QUERY, sort: 'newest', page: 3 })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_QUERY, available: true })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_QUERY, q: 'a' })).toBe(true);
  });
});
