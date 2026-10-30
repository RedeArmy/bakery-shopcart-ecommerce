import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildContainer } from '../../src/composition-root.js';
import { loadEnv } from '../../src/platform/config/env.js';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, '../../../docs/api/openapi/openapi.yaml');

type Json = Record<string, unknown>;
const spec = parse(readFileSync(specPath, 'utf8')) as {
  paths: Record<string, Record<string, Json>>;
  components: Record<string, Record<string, unknown>>;
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** "METHOD /ruta/:param" de cada operación del contrato. */
const specOperations = (): string[] =>
  Object.entries(spec.paths).flatMap(([path, operations]) =>
    Object.keys(operations)
      .filter((method) => METHODS.includes(method))
      .map((method) => `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`),
  );

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Recorre el enrutador de Express 5 y devuelve "METHOD /ruta" de cada ruta registrada. */
function expressOperations(stack: Layer[]): string[] {
  const found: string[] = [];
  for (const layer of stack) {
    if (layer.route !== undefined) {
      for (const method of Object.keys(layer.route.methods)) {
        // Los módulos se montan en /api/v1; las sondas de salud, en la raíz
        const prefix = layer.route.path.startsWith('/health') ? '' : '/api/v1';
        found.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
      }
    } else if (layer.handle?.stack !== undefined) {
      found.push(...expressOperations(layer.handle.stack));
    }
  }
  return found;
}

const env = loadEnv({
  NODE_ENV: 'test',
  DB_APP_USER: 'shopcart_app',
  DB_APP_PASSWORD: 'secret',
  APP_PUBLIC_URL: 'http://localhost:8080',
  JWT_ACCESS_SECRET: 'a-test-secret-of-sufficient-length',
  JWT_REFRESH_PEPPER: 'a-test-pepper-of-sufficient-length',
});

describe('OpenAPI contract', () => {
  it('describes exactly the operations the application serves', () => {
    const container = buildContainer(env);
    const router = (container.app as unknown as { router: { stack: Layer[] } }).router;
    const served = [...new Set(expressOperations(router.stack))].sort();
    const documented = specOperations().sort();

    expect(served.filter((operation) => !documented.includes(operation))).toEqual([]);
    expect(documented.filter((operation) => !served.includes(operation))).toEqual([]);
  });

  it('uses a unique operationId for every operation', () => {
    const ids = Object.values(spec.paths).flatMap((operations) =>
      Object.entries(operations)
        .filter(([method]) => METHODS.includes(method))
        .map(([, operation]) => operation['operationId'] as string),
    );
    expect(ids.every((id) => typeof id === 'string' && id !== '')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every $ref to something defined in the components', () => {
    const missing: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
          if (key === '$ref' && typeof value === 'string') {
            const [, section, name] = /^#\/components\/(\w+)\/(\w+)$/.exec(value) ?? [];
            if (
              section === undefined ||
              name === undefined ||
              spec.components[section]?.[name] === undefined
            ) {
              missing.push(value);
            }
          } else walk(value);
        }
      }
    };
    walk(spec.paths);
    walk(spec.components);
    expect(missing).toEqual([]);
  });

  it('requires an Idempotency-Key on every mutating call except sign-in, renewal and the cart merge', () => {
    const exempt = new Set([
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
      'POST /api/v1/cart/merge',
    ]);
    const lacking: string[] = [];
    for (const [path, operations] of Object.entries(spec.paths)) {
      for (const method of ['post', 'patch']) {
        const operation = operations[method];
        if (operation === undefined || exempt.has(`${method.toUpperCase()} ${path}`)) continue;
        const parameters = (operation['parameters'] ?? []) as Json[];
        if (
          !parameters.some(
            (parameter) => parameter['$ref'] === '#/components/parameters/IdempotencyKey',
          )
        ) {
          lacking.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(lacking).toEqual([]);
  });

  it('never declares an amount as a JSON number', () => {
    const offenders: string[] = [];
    for (const [name, schema] of Object.entries(spec.components['schemas'] ?? {})) {
      const properties = ((schema as Json)['properties'] ?? {}) as Record<string, Json>;
      for (const [property, definition] of Object.entries(properties)) {
        const looksLikeMoney =
          /(amount|price|total|subtotal|discount|vat|taxableBase|shipping|value)$/i.test(property);
        if (looksLikeMoney && definition['type'] === 'number')
          offenders.push(`${name}.${property}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
