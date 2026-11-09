// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  buildReturn,
  canReturn,
  canTakeStep,
  nextStep,
  parseStaffOrdersQuery,
  pendingReturn,
  staffOrdersParams,
} from '../../src/features/staff-orders/model/staff-orders';

describe('the address of the staff order list', () => {
  it('reads the status, the text and the page', () => {
    expect(
      parseStaffOrdersQuery(new URLSearchParams('status=3&q=%20ana%40x.test%20&page=2')),
    ).toEqual({
      status: 3,
      search: 'ana@x.test',
      page: 2,
    });
  });

  it('falls back to the defaults for what it does not understand', () => {
    expect(parseStaffOrdersQuery(new URLSearchParams('status=99&page=-4'))).toEqual({
      status: null,
      search: '',
      page: 1,
    });
  });

  it('cuts the text at 100 characters', () => {
    const long = 'a'.repeat(150);
    expect(parseStaffOrdersQuery(new URLSearchParams({ q: long })).search).toHaveLength(100);
  });

  it('only writes what differs from the defaults', () => {
    expect(staffOrdersParams({ status: null, search: '', page: 1 }).toString()).toBe('');
    expect(staffOrdersParams({ status: 2, search: 'PED-1', page: 3 }).toString()).toBe(
      'status=2&q=PED-1&page=3',
    );
  });
});

describe('the next step of an order', () => {
  it.each([
    ['Paid', 'Delivery', 'InPreparation'],
    ['InPreparation', 'Delivery', 'Dispatched'],
    ['Dispatched', 'Delivery', 'Delivered'],
    ['Paid', 'Pickup', 'InPreparation'],
    ['InPreparation', 'Pickup', 'Delivered'],
  ])('moves %s of a %s order to %s', (from, fulfilment, to) => {
    expect(nextStep(from, fulfilment)).toBe(to);
  });

  it('treats an order with no known fulfilment as a delivery', () => {
    expect(nextStep('InPreparation', undefined)).toBe('Dispatched');
  });

  it.each(['PendingPayment', 'Delivered', 'Cancelled', 'PartiallyReturned', 'Returned', 'Other'])(
    'has no step from %s',
    (status) => {
      expect(nextStep(status, 'Delivery')).toBeNull();
    },
  );

  it('lets only an operator mark a home delivery order as delivered', () => {
    expect(canTakeStep('Delivered', 'Delivery', 'Operator')).toBe(true);
    expect(canTakeStep('Delivered', 'Delivery', 'Administrator')).toBe(false);
    expect(canTakeStep('Delivered', 'Pickup', 'Administrator')).toBe(true);
    expect(canTakeStep('Delivered', 'Pickup', 'Operator')).toBe(true);
    expect(canTakeStep('Dispatched', 'Delivery', 'Administrator')).toBe(true);
    expect(canTakeStep('InPreparation', 'Delivery', 'Administrator')).toBe(true);
  });

  it('only returns an order that was delivered', () => {
    expect(canReturn('Delivered')).toBe(true);
    expect(canReturn('PartiallyReturned')).toBe(true);
    expect(canReturn('Dispatched')).toBe(false);
    expect(canReturn('Returned')).toBe(false);
  });
});

describe('building a return', () => {
  const lines = [
    { idOrderLine: 1, quantity: 3, returnedQuantity: 1 },
    { idOrderLine: 2, quantity: 2 },
  ];

  it('counts what is still pending on a line', () => {
    expect(pendingReturn({ idOrderLine: 1, quantity: 3, returnedQuantity: 1 })).toBe(2);
    expect(pendingReturn({ idOrderLine: 2, quantity: 2 })).toBe(2);
  });

  it('sends only the lines with units and trims the reason', () => {
    expect(buildReturn(lines, { 1: '2', 2: '' }, '  Llegó dañado  ')).toEqual({
      ok: true,
      body: { reason: 'Llegó dañado', lines: [{ idOrderLine: 1, quantity: 2 }] },
    });
  });

  it('asks for the reason first', () => {
    expect(buildReturn(lines, { 1: '1' }, '   ')).toEqual({ ok: false, problem: 'reasonRequired' });
  });

  it('refuses a reason that is too long', () => {
    expect(buildReturn(lines, { 1: '1' }, 'x'.repeat(251))).toEqual({
      ok: false,
      problem: 'reasonTooLong',
    });
  });

  it('needs at least one unit', () => {
    expect(buildReturn(lines, { 1: '0', 2: '' }, 'Motivo')).toEqual({
      ok: false,
      problem: 'nothingSelected',
    });
  });

  it.each(['3', '-1', '1.5', 'abc'])('refuses %s units', (text) => {
    expect(buildReturn(lines, { 1: text }, 'Motivo')).toEqual({
      ok: false,
      problem: 'quantityInvalid',
    });
  });
});
