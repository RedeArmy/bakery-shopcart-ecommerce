import { z } from 'zod';

export type Row = Record<string, unknown>;

/** Identificador positivo de una ruta o de un cuerpo (llega como texto en la ruta). */
export const positiveInt = z.coerce.number().int().positive();

/** Importe de la API: texto decimal con exactamente dos decimales, nunca un número JSON (ADR-0020). */
export const money = z
  .string()
  .regex(/^\d{1,16}\.\d{2}$/, 'Amounts are decimal strings such as "145.00"');

/** Paginación del servidor: página desde 1 y tamaño de 1 a 100 (docs/api/conventions.md). */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

/**
 * IDOrder → idOrder, SKU → sku, PrimaryImageUrl → primaryImageUrl. Una racha de mayúsculas se baja entera, salvo su
 * última letra cuando es la inicial de la palabra siguiente.
 */
export function camelKey(key: string): string {
  const run = /^[A-Z]+/.exec(key)?.[0] ?? '';
  if (run.length === 0) return key;
  const startsNextWord = run.length > 1 && run.length < key.length;
  const lowered = startsNextWord ? run.slice(0, -1).toLowerCase() : run.toLowerCase();
  return lowered + key.slice(lowered.length);
}

/** Solo fecha (yyyy-mm-dd) para las columnas DATE, que mssql entrega como medianoche UTC. */
const isDateColumn = (key: string): boolean => key.endsWith('Date');

function camelValue(key: string, value: unknown): unknown {
  if (value instanceof Date) {
    const iso = value.toISOString();
    return isDateColumn(key) ? iso.slice(0, 10) : iso;
  }
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map((item) => camelDeep(item));
  if (typeof value === 'object' && value !== null) return camelDeep(value);
  return value;
}

function camelDeep(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => camelDeep(item));
  if (typeof input !== 'object' || input === null) return input;
  return Object.fromEntries(
    Object.entries(input as Row).map(([key, value]) => [camelKey(key), camelValue(key, value)]),
  );
}

/**
 * Fila de un procedimiento → objeto de la API. `jsonColumns` son las columnas que la base entrega como texto JSON
 * (FOR JSON PATH): se analizan y sus claves también pasan a camelCase.
 */
export function camelRow(row: Row, jsonColumns: readonly string[] = []): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'TotalCount') continue;
    if (jsonColumns.includes(key) && typeof value === 'string') {
      out[camelKey(key)] = camelDeep(JSON.parse(value));
    } else {
      out[camelKey(key)] = camelValue(key, value);
    }
  }
  return out;
}

/** Lista paginada: `total` sale de la columna TotalCount que repite cada fila (0 si la página está vacía). */
export function toPage(
  rows: readonly Row[],
  page: number,
  size: number,
  jsonColumns: readonly string[] = [],
): Page<Row> {
  const total = rows.length === 0 ? 0 : Number(rows[0]?.['TotalCount'] ?? 0);
  return { items: rows.map((row) => camelRow(row, jsonColumns)), page, size, total };
}
