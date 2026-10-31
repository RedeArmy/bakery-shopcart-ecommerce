import { describe, expect, it } from 'vitest';
import { GENERATED_KEYS, completeEnv, generateSecret } from '../lib/env-file.js';

const example = [
  'MSSQL_SA_PASSWORD=',
  'DB_HOST=db',
  'DB_APP_PASSWORD=',
  'JWT_ACCESS_SECRET=',
  'JWT_REFRESH_PEPPER=',
  'SEED_DEMO_DATA=true',
  'SEED_ADMIN_PASSWORD=',
  'SEED_OPERATOR_PASSWORD=',
  'SEED_CUSTOMER_PASSWORD=',
  'EDGE_PORT=8080',
  '',
].join('\n');

let counter = 0;
const sequential = (): string => `secret${(counter += 1)}`;

const valueOf = (content: string, key: string): string | undefined =>
  content
    .split('\n')
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1);

describe('generateSecret', () => {
  it('is alphanumeric, long enough for the API and different every time', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Za-z0-9]{20,}$/);
    expect(secret.length).toBeGreaterThanOrEqual(10);
    expect(generateSecret()).not.toBe(secret);
  });

  it('has an upper case letter, a lower case letter and a digit', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/[A-Z]/);
    expect(secret).toMatch(/[a-z]/);
    expect(secret).toMatch(/\d/);
  });
});

describe('completeEnv without a .env', () => {
  it('generates every secret, the three test passwords included', () => {
    const { content, filled } = completeEnv(example, undefined, sequential);
    expect(filled).toEqual(GENERATED_KEYS);
    for (const key of GENERATED_KEYS) {
      expect(valueOf(content, key)).toMatch(/^secret\d+$/);
    }
  });

  it('gives every secret its own value', () => {
    const { content } = completeEnv(example, undefined, generateSecret);
    const values = GENERATED_KEYS.map((key) => valueOf(content, key));
    expect(new Set(values).size).toBe(GENERATED_KEYS.length);
  });

  it('keeps the fixed values and the layout of the example', () => {
    const { content } = completeEnv(example, undefined, sequential);
    expect(valueOf(content, 'DB_HOST')).toBe('db');
    expect(valueOf(content, 'SEED_DEMO_DATA')).toBe('true');
    expect(valueOf(content, 'EDGE_PORT')).toBe('8080');
    expect(content.endsWith('\n')).toBe(true);
  });
});

describe('completeEnv with a .env that already exists', () => {
  const full = example
    .split('\n')
    .map((line) => (GENERATED_KEYS.some((key) => line === `${key}=`) ? `${line}mine` : line))
    .join('\n');

  it('changes nothing when every secret has a value', () => {
    expect(completeEnv(example, full, sequential)).toEqual({ content: full, filled: [] });
  });

  it('never overwrites a value the user already has', () => {
    const edited = full.replace('DB_HOST=db', 'DB_HOST=elsewhere');
    expect(completeEnv(example, edited, sequential).content).toContain('DB_HOST=elsewhere');
  });

  // Un .env de antes de las cuentas de prueba: se completa sin tocar la contraseña de SQL Server de su volumen
  it('adds the test passwords to an older .env and keeps the database password', () => {
    const older = [
      'MSSQL_SA_PASSWORD=existing',
      'DB_APP_PASSWORD=existing2',
      'JWT_ACCESS_SECRET=existing3',
      'JWT_REFRESH_PEPPER=existing4',
      'EDGE_PORT=9000',
      '',
    ].join('\n');
    const { content, filled } = completeEnv(example, older, sequential);
    expect(filled).toEqual([
      'SEED_ADMIN_PASSWORD',
      'SEED_OPERATOR_PASSWORD',
      'SEED_CUSTOMER_PASSWORD',
      'SEED_DEMO_DATA',
    ]);
    expect(valueOf(content, 'MSSQL_SA_PASSWORD')).toBe('existing');
    expect(valueOf(content, 'EDGE_PORT')).toBe('9000');
    expect(valueOf(content, 'SEED_ADMIN_PASSWORD')).toMatch(/^secret\d+$/);
    expect(valueOf(content, 'SEED_DEMO_DATA')).toBe('true');
    expect(content.endsWith('\n')).toBe(true);
  });

  it('fills a secret that was left empty', () => {
    const emptied = full.replace('SEED_ADMIN_PASSWORD=mine', 'SEED_ADMIN_PASSWORD=');
    const { content, filled } = completeEnv(example, emptied, sequential);
    expect(filled).toEqual(['SEED_ADMIN_PASSWORD']);
    expect(valueOf(content, 'SEED_ADMIN_PASSWORD')).toMatch(/^secret\d+$/);
    expect(valueOf(content, 'SEED_OPERATOR_PASSWORD')).toBe('mine');
  });

  it('does not add a second copy of a variable the user set to another value', () => {
    const turnedOff = full.replace('SEED_DEMO_DATA=true', 'SEED_DEMO_DATA=false');
    const { content } = completeEnv(example, turnedOff, sequential);
    expect(content.match(/^SEED_DEMO_DATA=/gm)).toHaveLength(1);
    expect(valueOf(content, 'SEED_DEMO_DATA')).toBe('false');
  });
});
