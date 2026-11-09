// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  buildReturn,
  parseStaffOrdersQuery,
  pendingReturn,
  staffOrdersParams,
  stepToTake,
} from '../../src/features/staff-orders/model/staff-orders';

describe('the address of the staff order list', () => {
  it('reads the status, the text and the page', () => {
    expect(
      parseStaffOrdersQuery(new URLSearchParams('status=3&q=%20ana%40x.test%20&page=2')),
    ).toEqual({
      status: 3,
      search: 'ana@x.test',
      page: 2,
      from: null,
      to: null,
    });
  });

  it('falls back to the defaults for what it does not understand', () => {
    expect(parseStaffOrdersQuery(new URLSearchParams('status=99&page=-4'))).toEqual({
      status: null,
      search: '',
      page: 1,
      from: null,
      to: null,
    });
  });

  it('reads the first and the last day, and ignores what is not a date', () => {
    expect(
      parseStaffOrdersQuery(new URLSearchParams('from=2030-06-01&to=2030-06-30')),
    ).toMatchObject({
      from: '2030-06-01',
      to: '2030-06-30',
    });
    expect(parseStaffOrdersQuery(new URLSearchParams('from=ayer&to=2030-6-1'))).toMatchObject({
      from: null,
      to: null,
    });
  });

  it('cuts the text at 100 characters', () => {
    const long = 'a'.repeat(150);
    expect(parseStaffOrdersQuery(new URLSearchParams({ q: long })).search).toHaveLength(100);
  });

  it('only writes what differs from the defaults', () => {
    const none = { status: null, search: '', page: 1, from: null, to: null };
    expect(staffOrdersParams(none).toString()).toBe('');
    expect(
      staffOrdersParams({
        status: 2,
        search: 'PED-1',
        page: 3,
        from: '2030-06-01',
        to: '2030-06-30',
      }).toString(),
    ).toBe('status=2&q=PED-1&from=2030-06-01&to=2030-06-30&page=3');
  });
});

describe('the step that the server lets the caller take', () => {
  it.each([
    [['Prepare', 'Cancel'], 'InPreparation'],
    [['Cancel', 'Dispatch'], 'Dispatched'],
    [['Cancel', 'Deliver'], 'Delivered'],
    [['Deliver'], 'Delivered'],
  ] as const)('turns %j into the status %s', (actions, status) => {
    expect(stepToTake(actions)).toBe(status);
  });

  it('has no step when the server offers none of the three', () => {
    expect(stepToTake([])).toBeNull();
    expect(stepToTake(['Cancel'])).toBeNull();
    expect(stepToTake(['Return'])).toBeNull();
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
