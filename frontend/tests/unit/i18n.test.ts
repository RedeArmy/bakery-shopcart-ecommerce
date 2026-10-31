// cspell:ignore Pastelería
import { describe, expect, it } from 'vitest';
import i18n from '../../src/shared/i18n';

describe('i18n', () => {
  it('serves Spanish (es-GT) copy through English keys', () => {
    expect(i18n.language).toBe('es-GT');
    expect(i18n.t('common.appName')).toBe('Pastelería');
  });

  it('returns the key itself when a translation is missing, so gaps are visible', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
  });
});
