// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  EMPTY_COUPON,
  couponSchema,
  couponsParams,
  dayOf,
  newCouponSchema,
  parseCouponsQuery,
  toBody,
  valuesOf,
} from '../../src/features/coupons/model/coupons';
import type { Coupon, CouponValues } from '../../src/features/coupons/model/coupons';

const parse = (search: string) => parseCouponsQuery(new URLSearchParams(search));

describe('the coupons query', () => {
  it('starts with all the coupons, on the first page', () => {
    expect(parse('')).toEqual({ filter: 'all', page: 1 });
  });

  it('reads the filter and the page from the address', () => {
    expect(parse('status=inactive&page=3')).toEqual({ filter: 'inactive', page: 3 });
    expect(parse('status=active')).toEqual({ filter: 'active', page: 1 });
  });

  it('falls back to the default for what it does not understand', () => {
    expect(parse('status=Active&page=0')).toEqual({ filter: 'all', page: 1 });
    expect(parse('status=expired')).toEqual({ filter: 'all', page: 1 });
    expect(parse('page=1.5').page).toBe(1);
  });

  it('writes only what differs from the default', () => {
    expect(couponsParams({ filter: 'all', page: 1 }).toString()).toBe('');
    expect(couponsParams({ filter: 'inactive', page: 2 }).toString()).toBe(
      'status=inactive&page=2',
    );
    expect(couponsParams({ filter: 'active', page: 1 }).toString()).toBe('status=active');
  });
});

describe('the coupon form', () => {
  const valid = (): CouponValues => ({
    code: 'VERANO10',
    type: 'Percentage',
    value: '10',
    minimumAmount: '',
    startDay: '2030-06-01',
    endDay: '2030-06-30',
    totalUsageLimit: '',
    perCustomerUsageLimit: '',
    category: '',
  });

  const problems = (values: CouponValues, creating = true): string[] => {
    const result = (creating ? newCouponSchema : couponSchema).safeParse(values);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };

  it('accepts a complete coupon', () => {
    expect(problems(valid())).toEqual([]);
  });

  it('starts empty, as a percentage', () => {
    expect(EMPTY_COUPON.type).toBe('Percentage');
    expect(problems(EMPTY_COUPON)).toEqual(expect.arrayContaining(['code', 'value', 'startDay']));
  });

  it('asks for a code of 3 to 30 letters, numbers, hyphens or underscores, only when creating', () => {
    expect(problems({ ...valid(), code: 'AB' })).toContain('code');
    expect(problems({ ...valid(), code: 'A'.repeat(31) })).toContain('code');
    expect(problems({ ...valid(), code: 'con espacio' })).toContain('code');
    expect(problems({ ...valid(), code: 'ok_code-1' })).toEqual([]);
    // Al editar el código no cuenta: no se puede cambiar
    expect(problems({ ...valid(), code: '' }, false)).toEqual([]);
  });

  it('wants a value above zero, and a percentage of at most 100', () => {
    expect(problems({ ...valid(), value: '0' })).toContain('value');
    expect(problems({ ...valid(), value: 'abc' })).toContain('value');
    expect(problems({ ...valid(), value: '100.01' })).toContain('value');
    expect(problems({ ...valid(), value: '100' })).toEqual([]);
    // Un monto fijo no tiene ese tope
    expect(problems({ ...valid(), type: 'FixedAmount', value: '250.50' })).toEqual([]);
  });

  it('checks the minimum amount only when it is given', () => {
    expect(problems({ ...valid(), minimumAmount: '100' })).toEqual([]);
    expect(problems({ ...valid(), minimumAmount: '1x' })).toContain('minimumAmount');
  });

  it('asks for both days and does not accept the last before the first', () => {
    expect(problems({ ...valid(), startDay: '' })).toContain('startDay');
    expect(problems({ ...valid(), endDay: '' })).toContain('endDay');
    expect(problems({ ...valid(), startDay: '2030-07-01', endDay: '2030-06-30' })).toContain(
      'endDay',
    );
    // El mismo día sirve: rige ese día completo
    expect(problems({ ...valid(), startDay: '2030-06-30', endDay: '2030-06-30' })).toEqual([]);
  });

  it('keeps the limits whole and above zero, or empty', () => {
    expect(problems({ ...valid(), totalUsageLimit: '100', perCustomerUsageLimit: '1' })).toEqual(
      [],
    );
    expect(problems({ ...valid(), totalUsageLimit: '0' })).toContain('totalUsageLimit');
    expect(problems({ ...valid(), perCustomerUsageLimit: '1.5' })).toContain(
      'perCustomerUsageLimit',
    );
  });
});

describe('the days of Guatemala', () => {
  it('reads the start as the day that begins at midnight of UTC-6', () => {
    expect(dayOf('2030-06-01T06:00:00Z')).toBe('2030-06-01');
    expect(dayOf('2030-06-01T05:59:00Z')).toBe('2030-05-31');
  });

  it('reads the end, which is the following midnight, as the day before', () => {
    expect(dayOf('2030-07-01T06:00:00Z', true)).toBe('2030-06-30');
  });
});

describe('the request of a coupon', () => {
  const values = (): CouponValues => ({
    code: 'verano10',
    type: 'Percentage',
    value: '10',
    minimumAmount: '99,5',
    startDay: '2030-06-01',
    endDay: '2030-06-30',
    totalUsageLimit: '100',
    perCustomerUsageLimit: '',
    category: '4',
  });

  it('sends the code in capitals, the amounts with two decimals and the days as whole days', () => {
    expect(toBody(values(), true)).toEqual({
      code: 'VERANO10',
      type: 'Percentage',
      value: '10.00',
      minimumAmount: '99.50',
      startsAt: '2030-06-01T00:00:00-06:00',
      endsAt: '2030-07-01T06:00:00.000Z',
      totalUsageLimit: 100,
      perCustomerUsageLimit: null,
      categoryId: 4,
    });
  });

  it('leaves the code out when editing and the minimum out when it is empty', () => {
    const body = toBody({ ...values(), minimumAmount: '', category: '' }, false);
    expect(body).not.toHaveProperty('code');
    expect(body).not.toHaveProperty('minimumAmount');
    expect(body.categoryId).toBeNull();
  });
});

describe('editing a coupon', () => {
  const coupon: Coupon = {
    idCoupon: 5,
    code: 'VERANO10',
    type: 'FixedAmount',
    value: '25.00',
    minimumAmount: '100.00',
    startsAt: '2030-06-01T06:00:00Z',
    endsAt: '2030-07-01T06:00:00Z',
    totalUsageLimit: 50,
    perCustomerUsageLimit: null,
    idCategory: 3,
    isActive: true,
    status: 'Active',
  };

  it('fills the form with what the coupon already has', () => {
    expect(valuesOf(coupon)).toEqual({
      code: 'VERANO10',
      type: 'FixedAmount',
      value: '25.00',
      minimumAmount: '100.00',
      startDay: '2030-06-01',
      endDay: '2030-06-30',
      totalUsageLimit: '50',
      perCustomerUsageLimit: '',
      category: '3',
    });
  });

  it('sends back the same days it showed', () => {
    const body = toBody(valuesOf(coupon), false);
    expect(body.startsAt).toBe('2030-06-01T00:00:00-06:00');
    expect(body.endsAt).toBe('2030-07-01T06:00:00.000Z');
  });
});
