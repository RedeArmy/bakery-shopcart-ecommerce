import { isDateOnly } from '../../../shared/lib/date';

/** Cuántos registros se ven por página; el API admite hasta 100. */
export const PAGE_SIZE = 15;

/** Los módulos que dejan registro en la bitácora, tal como los escribe la base de datos. */
export const AUDIT_MODULES = [
  'Orders',
  'Payments',
  'PaymentMethods',
  'Products',
  'Prices',
  'Categories',
  'Stock',
  'Coupons',
  'Branches',
  'Users',
  'Reconciliation',
] as const;

export type AuditModule = (typeof AUDIT_MODULES)[number];

/** Las acciones que registra, tal como las escribe la base de datos. */
export const AUDIT_ACTIONS = ['Create', 'Update', 'Deactivate', 'StatusChange'] as const;

export const isAuditModule = (value: string): value is AuditModule =>
  (AUDIT_MODULES as readonly string[]).includes(value);

export interface AuditQuery {
  /** Un módulo de la lista o `null` para todos */
  module: AuditModule | null;
  /** El identificador de la entidad tal como lo busca el servidor (el número del pedido, el id del producto...) */
  entityKey: string;
  /** Primer día (inclusive), `aaaa-mm-dd`, o `null` */
  from: string | null;
  /** Último día (inclusive), `aaaa-mm-dd`, o `null` */
  to: string | null;
  page: number;
}

/**
 * Lo que dice la dirección: el módulo, el identificador buscado, el rango de días y la página. Lo que no se entiende vuelve al
 * valor por omisión en lugar de romper la pantalla.
 */
export function parseAuditQuery(params: URLSearchParams): AuditQuery {
  const module = params.get('module') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page') ?? '1');
  return {
    module: isAuditModule(module) ? module : null,
    entityKey: (params.get('key') ?? '').trim().slice(0, 40),
    from: isDateOnly(from) ? from : null,
    to: isDateOnly(to) ? to : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** La dirección para una consulta: solo lleva lo que se aparta del valor por omisión. */
export function auditParams(query: AuditQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.module !== null) params.set('module', query.module);
  if (query.entityKey !== '') params.set('key', query.entityKey);
  if (query.from !== null) params.set('from', query.from);
  if (query.to !== null) params.set('to', query.to);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

export interface FieldChange {
  /** El nombre del campo tal como lo guarda la base de datos */
  field: string;
  /** El valor anterior, o `null` si el registro no lo trae (una creación) */
  before: string | null;
  /** El valor nuevo, o `null` si el registro no lo trae (una desactivación sin valor) */
  after: string | null;
  /** Los mismos valores tal como vienen en el JSON (números, sí o no, arreglos), para darles formato según el campo */
  rawBefore: unknown;
  rawAfter: unknown;
  /** Todos los campos del registro con el nombre en minúsculas, para los valores que dependen de otro campo (el tipo del cupón) */
  context: Record<string, unknown>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Un texto JSON como objeto. Un arreglo suelto (las líneas de una devolución) se trata como el campo `lines`, para que se muestre
 * igual que los demás. Todo lo que no es un objeto ni un arreglo es un texto suelto y devuelve `null`.
 */
function parseObject(text: string | null | undefined): Record<string, unknown> | null {
  if (text === null || text === undefined || text === '') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return { lines: parsed };
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Un valor del JSON como texto legible: un texto tal cual, un objeto o un arreglo en JSON, y `null` como «sin valor». */
const show = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

/**
 * Lo que cambió en un registro, campo por campo, a partir de los dos textos JSON que guarda la bitácora. Solo salen los campos
 * cuyo valor cambió, en el orden en que aparecen. Si alguno de los dos no es un objeto JSON (un texto suelto) devuelve `null` y
 * la pantalla muestra los textos tal cual: nunca se pierde lo que se guardó.
 */
export function describeChange(
  previous: string | null | undefined,
  next: string | null | undefined,
): FieldChange[] | null {
  const before = parseObject(previous);
  const after = parseObject(next);
  const hasText = (text: string | null | undefined): boolean =>
    text !== null && text !== undefined && text !== '';
  if ((hasText(previous) && before === null) || (hasText(next) && after === null)) return null;
  if (before === null && after === null) return [];

  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const merged = { ...before, ...after };
  const context = Object.fromEntries(
    Object.entries(merged).map(([field, value]) => [field.toLowerCase(), value]),
  );
  return fields
    .map((field) => ({
      field,
      before: show(before?.[field]),
      after: show(after?.[field]),
      rawBefore: before?.[field] ?? null,
      rawAfter: after?.[field] ?? null,
      context,
    }))
    .filter((change) => change.before !== change.after);
}
