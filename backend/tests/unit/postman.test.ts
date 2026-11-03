// cspell:ignore Autenticación
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const folder = resolve(here, '../../../docs/api/postman');
const read = (file: string): unknown => JSON.parse(readFileSync(resolve(folder, file), 'utf8'));

interface Item {
  name: string;
  item?: Item[];
  request?: { method: string; url: string; auth?: { type: string } };
  event?: { listen: string; script: { exec: string[] } }[];
}
interface Collection {
  info: { name: string };
  variable: { key: string; value: string }[];
  item: Item[];
}
interface Environment {
  values: { key: string; value: string; type: string }[];
}

const collection = read('ShopCart.postman_collection.json') as Collection;
const spanishCollection = read('ShopCart.postman_collection.es.json') as Collection;
const environment = read('ShopCart.local.postman_environment.json') as Environment;
const spec = parse(
  readFileSync(resolve(here, '../../../docs/api/openapi/openapi.yaml'), 'utf8'),
) as {
  paths: Record<string, Record<string, unknown>>;
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
/** "METHOD /ruta/:parámetro" de cada operación del contrato, igual que en openapi.test.ts. */
const specOperations = new Set(
  Object.entries(spec.paths).flatMap(([path, operations]) =>
    Object.keys(operations)
      .filter((method) => METHODS.includes(method))
      .map((method) => `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`),
  ),
);

const requests = (items: Item[]): Item[] =>
  items.flatMap((entry) => (entry.item === undefined ? [entry] : requests(entry.item)));

/** La operación que una petición de Postman pide: sin servidor, sin consulta y con cada {{variable}} como parámetro. */
const operationOf = (entry: Item): string => {
  const path = (entry.request?.url ?? '')
    .replace('{{baseUrl}}', '')
    .split('?')[0]
    ?.replace(/\{\{\w+\}\}/g, ':p');
  return `${entry.request?.method} ${path}`;
};

// Dos parámetros distintos del contrato (:id, :variantId) valen lo mismo para Postman (:p)
const generic = (operation: string): string => operation.replace(/:\w+/g, ':p');
const specGeneric = new Set([...specOperations].map(generic));

const FOLDER_NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

describe.each([
  ['English', collection, 'Authentication'],
  ['Spanish', spanishCollection, 'Autenticación'],
] as const)('Postman collection (%s)', (_language, current, authenticationFolder) => {
  const all = requests(current.item);

  it('verifies the delivery in numbered folders, starting with the environment and authentication', () => {
    expect(current.item.map((entry) => entry.name.charAt(0))).toEqual(FOLDER_NUMBERS);
    expect(current.item[1]?.name).toContain(authenticationFolder);
  });

  // Si cambia una ruta del contrato, la colección que se entrega al evaluador no puede seguir pidiéndola
  it.each(all.map((entry) => [entry.name, operationOf(entry)] as const))(
    'asks for an operation that the OpenAPI contract has: %s',
    (_name, operation) => {
      expect(specGeneric.has(generic(operation))).toBe(true);
    },
  );

  it('checks something in every request', () => {
    const silent = all.filter(
      (entry) => !(entry.event ?? []).some((event) => event.listen === 'test'),
    );
    expect(silent.map((entry) => entry.name)).toEqual([]);
  });

  it('asks for no operation twice with the same purpose: every request is needed', () => {
    // Una operación puede repetirse (iniciar sesión, cancelar), pero nunca con el mismo nombre
    const names = all.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps no password, no token and no real address in the collection', () => {
    const text = JSON.stringify(current);
    expect(current.variable.find((entry) => entry.key === 'adminPassword')?.value).toBe('');
    expect(current.variable.find((entry) => entry.key === 'customerPassword')?.value).toBe('');
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  });
});

describe('Postman collections', () => {
  const english = requests(collection.item);
  const spanish = requests(spanishCollection.item);
  const shape = (entry: Item): string[] => [
    operationOf(entry),
    entry.request?.auth?.type ?? 'none',
    String((entry.event ?? []).length),
  ];

  it('is the same collection in both languages: same operations, same authentication, same scripts', () => {
    expect(spanish.map(shape)).toEqual(english.map(shape));
  });

  it('sends no token only on the calls that are public on purpose', () => {
    const anonymous = english
      .filter((entry) => entry.request?.auth?.type === 'noauth')
      .map((entry) => entry.name);
    for (const name of anonymous) {
      expect(name).toMatch(
        /Readiness|Register|Sign in|without a token|Renew|Present the old|renewed token|public store|stock is back|wrong password/i,
      );
    }
    // La versión en español hereda la autenticación de la inglesa, petición por petición
    expect(spanish.map((entry) => entry.request?.auth?.type)).toEqual(
      english.map((entry) => entry.request?.auth?.type),
    );
  });
});

describe('Postman environment', () => {
  it('leaves the passwords empty and marks them as secret, so the file can be versioned', () => {
    const passwords = environment.values.filter((entry) => /password/i.test(entry.key));
    expect(passwords.map((entry) => entry.key).sort()).toEqual([
      'adminPassword',
      'customerPassword',
    ]);
    for (const entry of passwords) {
      expect(entry.value).toBe('');
      expect(entry.type).toBe('secret');
    }
  });

  it('points at the stack of the quick start and uses the documented test accounts', () => {
    const value = (key: string): string | undefined =>
      environment.values.find((entry) => entry.key === key)?.value;
    expect(value('baseUrl')).toBe('http://localhost:8080');
    expect(value('adminEmail')).toBe('admin@shopcart.test');
    expect(value('otherCustomerEmail')).toBe('customer2@shopcart.test');
  });

  it('declares every variable the collection reads from the environment', () => {
    const declared = new Set(environment.values.map((entry) => entry.key));
    for (const key of [
      'baseUrl',
      'adminEmail',
      'adminPassword',
      'otherCustomerEmail',
      'customerPassword',
    ]) {
      expect(declared.has(key)).toBe(true);
    }
  });
});
