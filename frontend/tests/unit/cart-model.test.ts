import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_QUANTITY,
  couponReasonKey,
  isZeroMoney,
  lineBlocked,
  lineLimit,
  nextQuantity,
} from '../../src/features/cart/model/cart-model';
import {
  clearGuestToken,
  getGuestToken,
  peekGuestToken,
} from '../../src/features/cart/model/guest-token';

describe('cart quantities', () => {
  it('adds to what was already in the cart without passing the 99 of the contract', () => {
    expect(nextQuantity(0, 1)).toBe(1);
    expect(nextQuantity(2, 3)).toBe(5);
    expect(nextQuantity(98, 5)).toBe(MAX_QUANTITY);
    expect(nextQuantity(0, 0)).toBe(1);
  });

  it('limits a line to the units left, and to 99', () => {
    expect(lineLimit({ available: 4 })).toBe(4);
    expect(lineLimit({ available: 500 })).toBe(99);
    expect(lineLimit({ available: 0 })).toBe(0);
    expect(lineLimit({})).toBe(99);
  });

  it('blocks a line that is sold out or asks for more than what is left', () => {
    expect(lineBlocked({ isAvailable: true, quantity: 2, available: 5 })).toBe(false);
    expect(lineBlocked({ isAvailable: true, quantity: 6, available: 5 })).toBe(true);
    expect(lineBlocked({ isAvailable: false, quantity: 1, available: 0 })).toBe(true);
    expect(lineBlocked({ quantity: 1 })).toBe(false);
  });
});

describe('cart money and coupon helpers', () => {
  it('recognises a zero amount from its text only', () => {
    expect(isZeroMoney('0.00')).toBe(true);
    expect(isZeroMoney('0')).toBe(true);
    expect(isZeroMoney('0.01')).toBe(false);
    expect(isZeroMoney('10.00')).toBe(false);
  });

  it('maps every known reason of the server and falls back for a new one', () => {
    expect(couponReasonKey('Expired')).toBe('cart.coupon.reasons.Expired');
    expect(couponReasonKey('AlreadyUsed')).toBe('cart.coupon.reasons.AlreadyUsed');
    expect(couponReasonKey('SomethingNew')).toBe('cart.coupon.reasons.Unknown');
  });
});

describe('guest cart token', () => {
  afterEach(() => {
    clearGuestToken();
    localStorage.clear();
  });

  it('is not created until the visitor adds something, then it stays the same', () => {
    expect(peekGuestToken()).toBeNull();
    const created = getGuestToken();
    expect(created).toMatch(/^[0-9a-f-]{36}$/);
    expect(peekGuestToken()).toBe(created);
    expect(getGuestToken()).toBe(created);
  });

  it('ignores a stored value that is not a UUID and replaces it', () => {
    localStorage.setItem('shopcart.cartToken', 'not-a-uuid');
    expect(peekGuestToken()).toBeNull();
    expect(getGuestToken()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is forgotten when it is cleared', () => {
    getGuestToken();
    clearGuestToken();
    expect(peekGuestToken()).toBeNull();
  });
});
