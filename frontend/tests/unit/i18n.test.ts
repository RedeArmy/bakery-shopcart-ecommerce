// cspell:ignore Pastelería
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n from '../../src/shared/i18n';
import { esGT } from '../../src/shared/i18n/resources/es-GT';

// Sigue la ruta de la clave dentro del recurso: no depende del estado de i18next
const hasKey = (key: string): boolean => {
  let node: unknown = esGT;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return false;
    const entries = node as Record<string, unknown>;
    // Las claves con plural se guardan como `clave_one` y `clave_other`
    if (part in entries) node = entries[part];
    else if (`${part}_other` in entries) node = entries[`${part}_other`];
    else return false;
  }
  return true;
};

describe('i18n', () => {
  it('serves Spanish (es-GT) copy through English keys', () => {
    expect(i18n.language).toBe('es-GT');
    expect(i18n.t('common.appName')).toBe('Pastelería');
  });

  it('returns the key itself when a translation is missing, so gaps are visible', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
  });

  it('has a translation for every literal key the source asks for', () => {
    // Recorre el código y comprueba cada clave escrita como texto (`t('a.b')` o `labelKey: 'a.b'`); las dinámicas no se ven aquí
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== 'generated') walk(path);
        } else if (/\.tsx?$/.test(name)) {
          files.push(path);
        }
      }
    };
    walk(join(__dirname, '../../src'));

    expect(files.length).toBeGreaterThan(20);
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /\bt\(\s*'([A-Za-z][\w.]*)'|labelKey:\s*'([A-Za-z][\w.]*)'/g,
      )) {
        const key = match[1] ?? match[2] ?? '';
        if (!hasKey(key)) missing.push(`${key} (${file.split('src')[1] ?? file})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
