// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  entityKeyLabel,
  entityLabel,
  fieldLabel,
  formatNested,
  formatValue,
  humanise,
  isNested,
} from '../../src/features/audit/model/audit-format';
import i18n from '../../src/shared/i18n';

const t = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;

describe('audit values in Spanish', () => {
  it('names the fields in Spanish and humanises the unknown ones', () => {
    expect(fieldLabel(t, 'IDVariant')).toBe('Variante');
    expect(fieldLabel(t, 'sku')).toBe('Código (SKU)');
    expect(fieldLabel(t, 'OpeningHoursX')).toBe('Opening hours x');
    expect(humanise('IDSomething')).toBe('Something');
  });

  it('names the entities and the keys', () => {
    expect(entityLabel(t, 'Unknown')).toBe('Unknown');
    expect(entityKeyLabel(t, '21')).toBe('n.º 21');
    expect(entityKeyLabel(t, '2026-11-09')).toBe('2026-11-09');
  });

  it('formats booleans, identifiers, money and sizes', () => {
    expect(formatValue(t, 'IsActive', true)).toBe('Sí');
    expect(formatValue(t, 'IsActive', false)).toBe('No');
    expect(formatValue(t, 'IDVariant', 21)).toBe('n.º 21');
    expect(formatValue(t, 'Price', '12.50')).toContain('12.50');
    expect(formatValue(t, 'Price', 'abc')).toBe('abc');
    expect(formatValue(t, 'SizeBytes', 2048)).toBe('2.0 KB');
    expect(formatValue(t, 'Name', null)).toBeNull();
    expect(formatValue(t, 'Name', 'Pan')).toBe('Pan');
  });

  it('reads a coupon value as a percentage or as an amount', () => {
    expect(formatValue(t, 'Value', '10.00', { type: 'Percentage' })).toBe('10.00 %');
    expect(formatValue(t, 'Value', '10.00', { type: 'FixedAmount' })).toContain('10.00');
  });

  it('turns the status identifiers into their names', () => {
    expect(formatValue(t, 'IDOrderStatus', 2)).toBe(t('orders.status.Paid'));
    expect(formatValue(t, 'IDOrderStatus', 99)).toBe('99');
    expect(formatValue(t, 'IDPaymentStatus', 3)).toBe(t('audit.paymentStatus.Approved'));
  });

  it('shows the moments in Guatemala time', () => {
    expect(formatValue(t, 'StartsAt', '2026-11-09T12:00:00')).not.toContain('T12');
    expect(formatValue(t, 'RequestedDeliveryDate', '2026-11-09')).toContain('2026');
    expect(formatValue(t, 'EndsAt', 'garbage')).toBe('garbage');
  });

  it('lists nested values one line per item', () => {
    expect(formatNested(t, [{ Name: 'Tamaño', Value: 'Bolsa de 6' }])).toEqual([
      'Tamaño: Bolsa de 6',
    ]);
    expect(formatNested(t, [{ idOrderLine: 4, quantity: 2 }])[0]).toContain('n.º 4');
    expect(formatNested(t, ['a'])).toEqual(['a']);
    expect(formatNested(t, 5)).toEqual([]);
    expect(isNested([])).toBe(true);
    expect(isNested('x')).toBe(false);
  });
});
