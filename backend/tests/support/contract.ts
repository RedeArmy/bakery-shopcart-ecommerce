import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { parse } from 'yaml';

/**
 * Comprueba que una respuesta real cumple el contrato OpenAPI (ADR-0011): que la operación existe, que el estado está documentado
 * y que el cuerpo tiene la forma del esquema. El contrato es la fuente de verdad de los tipos del frontend; sin esto, una
 * respuesta que se aparta de él (un campo que falta, un tipo distinto) pasa sin aviso hasta que falla una pantalla.
 */

type Json = Record<string, unknown>;

export interface RecordedResponse {
  method: string;
  /** La dirección sin la cadena de consulta, tal como se pidió: `/api/v1/orders/42` */
  path: string;
  status: number;
  body: unknown;
}

interface OperationMatcher {
  template: string;
  method: string;
  pattern: RegExp;
  /** Cuántos parámetros lleva: entre dos rutas que encajan gana la más concreta (`/orders/track` antes que `/orders/{id}`) */
  parameters: number;
  responses: Json;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Formatos del contrato que Ajv no trae: fechas y fechas con hora se comprueban; el resto solo debe ser texto. */
const FORMATS: Record<string, RegExp | true> = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  email: /^[^\s@]+@[^\s@]+$/,
  binary: true,
};

export interface Contract {
  /** `null` si la respuesta cumple el contrato; si no, qué se aparta de él, en una línea. */
  check(response: RecordedResponse): string | null;
}

export function loadContract(specPath: string): Contract {
  const spec = parse(readFileSync(specPath, 'utf8')) as { paths: Record<string, Json> };
  return createContract(spec);
}

export function createContract(spec: { paths: Record<string, Json> }): Contract {
  const root = spec as unknown as Json;

  // Resuelve una referencia local («#/components/schemas/Order») recorriendo el documento
  const pointer = (ref: string): unknown =>
    ref
      .replace(/^#\//, '')
      .split('/')
      .reduce<unknown>((node, key) => (node as Json | undefined)?.[key], root);

  const resolved = new Map<string, unknown>();
  /** Copia el nodo con todas sus referencias sustituidas, para que cada esquema sea autónomo. Una referencia circular se corta. */
  const inline = (node: unknown, stack: readonly string[] = []): unknown => {
    if (Array.isArray(node)) return node.map((item) => inline(item, stack));
    if (typeof node !== 'object' || node === null) return node;
    const object = node as Json;
    const ref = object['$ref'];
    if (typeof ref === 'string') {
      if (stack.includes(ref)) return {};
      const cached = resolved.get(ref);
      if (cached !== undefined) return cached;
      const value = inline(pointer(ref), [...stack, ref]);
      resolved.set(ref, value);
      return value;
    }
    const copy = Object.fromEntries(
      Object.entries(object).map(([key, value]) => [key, inline(value, stack)]),
    );
    // `nullable` sin `type` (un allOf que envuelve una referencia) es válido en OpenAPI 3.0, pero Ajv no lo admite: se dice como
    // «el esquema o null»
    if (copy['nullable'] === true && copy['type'] === undefined) {
      const rest = Object.fromEntries(Object.entries(copy).filter(([key]) => key !== 'nullable'));
      return { anyOf: [rest, { type: 'null' }] };
    }
    return copy;
  };

  const operations: OperationMatcher[] = Object.entries(spec.paths).flatMap(([template, item]) =>
    Object.entries(item)
      .filter(([method]) => METHODS.includes(method))
      .map(([method, operation]) => ({
        template,
        method: method.toUpperCase(),
        pattern: new RegExp(
          `^${template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`,
        ),
        parameters: (template.match(/\{[^}]+\}/g) ?? []).length,
        responses: (operation as Json)['responses'] as Json,
      })),
  );

  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
  for (const [name, format] of Object.entries(FORMATS)) ajv.addFormat(name, format);
  const validators = new Map<string, ValidateFunction | null>();

  const operationOf = (method: string, path: string): OperationMatcher | undefined =>
    operations
      .filter((operation) => operation.method === method && operation.pattern.test(path))
      .sort((a, b) => a.parameters - b.parameters)[0];

  const validatorFor = (operation: OperationMatcher, status: number): ValidateFunction | null => {
    const id = `${operation.method} ${operation.template} ${String(status)}`;
    if (validators.has(id)) return validators.get(id) ?? null;
    // Un estado que el contrato no nombra se describe con `default`, si la operación lo trae
    const documented = operation.responses[String(status)] ?? operation.responses['default'];
    const response = inline(documented) as Json | undefined;
    const schema = (
      (response?.['content'] as Json | undefined)?.['application/json'] as Json | undefined
    )?.['schema'];
    // Una respuesta sin cuerpo JSON (204, un archivo) no tiene forma que comprobar
    const validator = schema === undefined ? null : ajv.compile(schema as object);
    validators.set(id, validator);
    return validator;
  };

  return {
    check({ method, path, status, body }) {
      const operation = operationOf(method.toUpperCase(), path);
      if (operation === undefined) return `${method} ${path}: no operation of the contract matches`;
      if (
        operation.responses[String(status)] === undefined &&
        operation.responses['default'] === undefined
      ) {
        return `${method} ${operation.template}: the status ${String(status)} is not documented`;
      }
      if (body === undefined) return null;
      const validator = validatorFor(operation, status);
      if (validator === null || validator(body)) return null;
      const reasons = (validator.errors ?? [])
        .slice(0, 3)
        .map((error) =>
          `${error.instancePath === '' ? 'body' : error.instancePath} ${error.message ?? ''}`.trim(),
        )
        .join('; ');
      return `${method} ${operation.template} → ${String(status)}: ${reasons}`;
    },
  };
}

/**
 * Un registro de las respuestas JSON de una aplicación Express, para comprobarlas contra el contrato al terminar. Se monta delante
 * de la aplicación y no toca lo que esta responde.
 */
export function createRecorder() {
  const responses: RecordedResponse[] = [];
  return {
    responses,
    middleware: (
      request: { method: string; originalUrl: string },
      response: { statusCode: number; json: (body?: unknown) => unknown },
      next: () => void,
    ): void => {
      const original = response.json.bind(response);
      response.json = (body?: unknown) => {
        responses.push({
          method: request.method,
          path: request.originalUrl.split('?')[0] ?? request.originalUrl,
          status: response.statusCode,
          body,
        });
        return original(body);
      };
      next();
    },
  };
}
