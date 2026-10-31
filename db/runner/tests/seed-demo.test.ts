import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isTestDatabase, loadRunnerConfig } from '../src/config.js';
import { RESTRICTED_PROCEDURES } from '../src/database.js';
import { DEMO_ACCOUNTS, argon2idHasher } from '../src/seed-demo.js';

const base = { MIGRATION_PASSWORD: 'Abcdefg12345' };
const enabled = {
  ...base,
  SEED_DEMO_DATA: 'true',
  SEED_ADMIN_PASSWORD: 'AdminPassword1',
  SEED_OPERATOR_PASSWORD: 'OperatorPassword1',
  SEED_CUSTOMER_PASSWORD: 'CustomerPassword1',
};

describe('seed configuration', () => {
  it.each([undefined, '', 'false'])('creates no accounts when SEED_DEMO_DATA is %j', (flag) => {
    expect(loadRunnerConfig({ ...enabled, SEED_DEMO_DATA: flag }).seed).toBeUndefined();
  });

  it('reads the three passwords when the flag is true', () => {
    expect(loadRunnerConfig(enabled).seed).toEqual({
      adminPassword: 'AdminPassword1',
      operatorPassword: 'OperatorPassword1',
      customerPassword: 'CustomerPassword1',
    });
  });

  it('does not need the passwords while the flag is off', () => {
    expect(loadRunnerConfig({ ...base, SEED_DEMO_DATA: 'false' }).seed).toBeUndefined();
  });

  it('rejects a flag that is neither true nor false', () => {
    expect(() => loadRunnerConfig({ ...enabled, SEED_DEMO_DATA: 'yes' })).toThrow(/SEED_DEMO_DATA/);
  });

  it.each(['SEED_ADMIN_PASSWORD', 'SEED_OPERATOR_PASSWORD', 'SEED_CUSTOMER_PASSWORD'])(
    'fails and names %s when it is missing or empty',
    (variable) => {
      expect(() => loadRunnerConfig({ ...enabled, [variable]: undefined })).toThrow(variable);
      expect(() => loadRunnerConfig({ ...enabled, [variable]: '' })).toThrow(variable);
    },
  );

  it('rejects a password shorter than the API accepts or too long, without printing it', () => {
    const short = 'Short1';
    expect(() => loadRunnerConfig({ ...enabled, SEED_ADMIN_PASSWORD: short })).toThrow(
      /SEED_ADMIN_PASSWORD must have between 10 and 128/,
    );
    try {
      loadRunnerConfig({ ...enabled, SEED_ADMIN_PASSWORD: short });
    } catch (error) {
      expect((error as Error).message).not.toContain(short);
    }
    expect(() => loadRunnerConfig({ ...enabled, SEED_ADMIN_PASSWORD: 'a'.repeat(129) })).toThrow(
      /between 10 and 128/,
    );
  });
});

describe('demo accounts', () => {
  it('are the four documented accounts, one per role plus a second customer', () => {
    expect(DEMO_ACCOUNTS.map((account) => account.email)).toEqual([
      'admin@shopcart.test',
      'operator@shopcart.test',
      'customer1@shopcart.test',
      'customer2@shopcart.test',
    ]);
    expect(DEMO_ACCOUNTS.map((account) => account.idRole)).toEqual([3, 2, 1, 1]);
  });

  // El dominio .test está reservado (RFC 2606): ninguna dirección puede llegar a un buzón real
  it('use the reserved .test domain and fit the columns', () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(account.email).toMatch(/^[a-z0-9]+@shopcart\.test$/);
      expect(account.fullName.length).toBeLessThanOrEqual(120);
    }
  });

  it('take each password from its own variable, both customers sharing one', () => {
    expect(DEMO_ACCOUNTS.map((account) => account.password)).toEqual([
      'adminPassword',
      'operatorPassword',
      'customerPassword',
      'customerPassword',
    ]);
  });

  // La guía de cuentas de prueba y el README citan estas direcciones: si divergen, el evaluador no podría entrar
  it('are the ones written in the test accounts guide', () => {
    const guide = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../docs/operations/test-accounts.md'),
      'utf8',
    );
    for (const account of DEMO_ACCOUNTS) expect(guide).toContain(account.email);
  });
});

describe('argon2idHasher', () => {
  it('produces an argon2id hash, never the password, and a different one each time', async () => {
    const first = await argon2idHasher('CustomerPassword1');
    const second = await argon2idHasher('CustomerPassword1');
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toContain('CustomerPassword1');
    expect(first).not.toBe(second);
  });
});

describe('restricted procedures', () => {
  it('keeps the role-assigning procedure away from the application login', () => {
    expect(RESTRICTED_PROCEDURES).toContain('dbo.SP_Users_Provision');
  });

  // Se incrustan en el DENY sin parámetros: solo pueden ser identificadores simples
  it.each(RESTRICTED_PROCEDURES)('%s is a plain schema-qualified identifier', (name) => {
    expect(name).toMatch(/^dbo\.\w+$/);
  });
});

describe('isTestDatabase', () => {
  it('recognises the databases of tSQLt by their _CI suffix', () => {
    expect(isTestDatabase('ShopCart_CI')).toBe(true);
    expect(isTestDatabase('Other_CI')).toBe(true);
  });

  it('does not take the shop database or a similar name for a test database', () => {
    expect(isTestDatabase('ShopCart')).toBe(false);
    expect(isTestDatabase('ShopCart_CI_backup')).toBe(false);
    expect(isTestDatabase('CI')).toBe(false);
  });
});
