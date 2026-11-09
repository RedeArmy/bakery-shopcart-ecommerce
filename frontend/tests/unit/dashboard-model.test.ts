// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  activePreset,
  dashboardParams,
  isReversed,
  lastDays,
  parseDashboardQuery,
  firstName,
  periodLabel,
  plotValue,
  rangeParams,
  statusId,
} from '../../src/features/dashboard/model/dashboard';

describe('the address of the dashboard', () => {
  it('reads the period and the grouping', () => {
    expect(
      parseDashboardQuery(new URLSearchParams('from=2030-06-01&to=2030-06-30&granularity=week')),
    ).toEqual({ from: '2030-06-01', to: '2030-06-30', granularity: 'week' });
  });

  it('falls back to the server defaults for what it does not understand', () => {
    expect(parseDashboardQuery(new URLSearchParams('from=ayer&to=&granularity=year'))).toEqual({
      from: null,
      to: null,
      granularity: 'day',
    });
  });

  it('only writes what differs from the defaults', () => {
    expect(dashboardParams({ from: null, to: null, granularity: 'day' }).toString()).toBe('');
    expect(dashboardParams({ from: '2030-06-01', to: null, granularity: 'month' }).toString()).toBe(
      'from=2030-06-01&granularity=month',
    );
  });

  it('sends the API only the ends that were chosen', () => {
    expect(rangeParams({ from: null, to: null })).toEqual({});
    expect(rangeParams({ from: '2030-06-01', to: null })).toEqual({ from: '2030-06-01' });
    expect(rangeParams({ from: '2030-06-01', to: '2030-06-30' })).toEqual({
      from: '2030-06-01',
      to: '2030-06-30',
    });
  });

  it('knows when the range is reversed', () => {
    expect(isReversed({ from: '2030-06-10', to: '2030-06-01' })).toBe(true);
    expect(isReversed({ from: '2030-06-01', to: '2030-06-10' })).toBe(false);
    expect(isReversed({ from: null, to: '2030-06-10' })).toBe(false);
  });
});

describe('the presets', () => {
  const now = new Date(2030, 5, 15, 9);

  it('goes back days - 1 days so that today counts', () => {
    expect(lastDays(7, now)).toEqual({ from: '2030-06-09', to: null });
    expect(lastDays(1, now)).toEqual({ from: '2030-06-15', to: null });
    expect(lastDays(30, now)).toEqual({ from: '2030-05-17', to: null });
  });

  it('crosses a month and a year', () => {
    expect(lastDays(7, new Date(2030, 0, 3, 9))).toEqual({ from: '2029-12-28', to: null });
  });

  it('recognises the preset that describes a period and none for a hand-picked one', () => {
    expect(activePreset({ from: '2030-06-09', to: null }, now)).toBe(7);
    expect(activePreset({ from: '2030-05-17', to: null }, now)).toBe(30);
    expect(activePreset({ from: '2030-06-01', to: null }, now)).toBeNull();
    expect(activePreset({ from: '2030-06-09', to: '2030-06-15' }, now)).toBeNull();
    expect(activePreset({ from: null, to: null }, now)).toBeNull();
  });
});

describe('what the charts show', () => {
  it('names a day or a week by its first day and a month by its month', () => {
    expect(periodLabel('2030-06-10', 'day')).toContain('10');
    expect(periodLabel('2030-06-10', 'week')).toContain('jun');
    expect(periodLabel('2030-06-01', 'month')).toContain('2030');
    expect(periodLabel('pronto', 'day')).toBe('pronto');
  });

  it('turns an amount into a height without touching the text', () => {
    expect(plotValue('1234.50')).toBe(1234.5);
    expect(plotValue('no es un monto')).toBe(0);
  });

  it('greets by the first name', () => {
    expect(firstName('Eder Yafeth Garcia Quiroa')).toBe('Eder');
    expect(firstName('  Ana   López ')).toBe('Ana');
    expect(firstName('Operador')).toBe('Operador');
    expect(firstName('')).toBe('');
  });

  it('knows the numbers of the order states', () => {
    expect(statusId('PendingPayment')).toBe(1);
    expect(statusId('Paid')).toBe(2);
    expect(statusId('Dispatched')).toBe(4);
  });
});
