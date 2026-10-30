/**
 * Quita los comentarios de un script T-SQL (bloque y de línea) respetando las cadenas.
 * Un recorrido de un solo paso en lugar de expresiones regulares: es lineal y no tiene retroceso.
 * Así, nombrar un procedimiento en un comentario no cuenta como cubrirlo con una prueba.
 */
export function stripSqlComments(sql: string): string {
  let result = '';
  let index = 0;

  while (index < sql.length) {
    const char = sql.charAt(index);
    const next = sql.charAt(index + 1);

    if (char === "'") {
      // Una comilla doble dentro de la cadena ('') es una comilla escapada, no el cierre
      let end = index + 1;
      while (end < sql.length && !(sql.charAt(end) === "'" && sql.charAt(end + 1) !== "'")) {
        end += sql.charAt(end) === "'" ? 2 : 1;
      }
      result += sql.slice(index, end + 1);
      index = end + 1;
    } else if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', index);
      index = end === -1 ? sql.length : end;
    } else if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      index = end === -1 ? sql.length : end + 2;
      result += ' ';
    } else {
      result += char;
      index += 1;
    }
  }
  return result;
}

const PROCEDURE_NAME = /\bSP_[A-Za-z0-9]+_[A-Za-z0-9]+\b/g;
const EXACT_PROCEDURE_NAME = /^SP_[A-Za-z0-9]+_[A-Za-z0-9]+$/;

/** Nombres SP_Modulo_Proceso que aparecen en el código (no en los comentarios) de un script. */
export function extractProcedureNames(sql: string): Set<string> {
  return new Set(stripSqlComments(sql).match(PROCEDURE_NAME) ?? []);
}

/**
 * Procedimientos críticos: los que el catálogo marca en negrita y en código, por ejemplo **`SP_Orders_CreateOrder`**.
 * El catálogo es la fuente de verdad, así que añadir un procedimiento crítico no exige tocar este script.
 */
export function parseCriticalProcedures(markdown: string): string[] {
  const names = new Set<string>();
  const open = '**`';
  const close = '`**';
  let position = markdown.indexOf(open);

  while (position !== -1) {
    const end = markdown.indexOf(close, position + open.length);
    if (end === -1) break;
    const name = markdown.slice(position + open.length, end);
    if (EXACT_PROCEDURE_NAME.test(name)) names.add(name);
    position = markdown.indexOf(open, end + close.length);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export interface CoverageReport {
  /** Procedimientos críticos que existen y no tienen ninguna prueba: rompen el CI */
  missingCritical: string[];
  /** Procedimientos no críticos sin prueba: solo avisan */
  missingOther: string[];
  /** Críticos del catálogo que todavía no existen: pendientes de su etapa */
  plannedCritical: string[];
  covered: number;
  total: number;
}

export function buildReport(
  existing: readonly string[],
  critical: readonly string[],
  tested: ReadonlySet<string>,
): CoverageReport {
  const isCritical = new Set(critical);
  const missing = existing.filter((name) => !tested.has(name));
  const present = new Set(existing);

  return {
    missingCritical: missing.filter((name) => isCritical.has(name)),
    missingOther: missing.filter((name) => !isCritical.has(name)),
    plannedCritical: critical.filter((name) => !present.has(name)),
    covered: existing.length - missing.length,
    total: existing.length,
  };
}
