interface Chunk {
  /** Texto que se conserva del fragmento leído */
  text: string;
  /** Posición donde continúa la lectura */
  next: number;
}

// Una comilla doble dentro de la cadena ('') es una comilla escapada, no el cierre
function readString(sql: string, start: number): Chunk {
  let end = start + 1;
  while (end < sql.length) {
    if (sql.charAt(end) !== "'") {
      end += 1;
    } else if (sql.charAt(end + 1) === "'") {
      end += 2;
    } else {
      break;
    }
  }
  return { text: sql.slice(start, end + 1), next: end + 1 };
}

function readLineComment(sql: string, start: number): Chunk {
  const end = sql.indexOf('\n', start);
  return { text: '', next: end === -1 ? sql.length : end };
}

// Se deja un espacio para que los dos lados del comentario no se peguen en una sola palabra
function readBlockComment(sql: string, start: number): Chunk {
  const end = sql.indexOf('*/', start + 2);
  return { text: ' ', next: end === -1 ? sql.length : end + 2 };
}

function readChunk(sql: string, index: number): Chunk {
  const char = sql.charAt(index);
  const next = sql.charAt(index + 1);

  if (char === "'") return readString(sql, index);
  if (char === '-' && next === '-') return readLineComment(sql, index);
  if (char === '/' && next === '*') return readBlockComment(sql, index);
  return { text: char, next: index + 1 };
}

/**
 * Quita los comentarios de un script T-SQL (bloque y de línea) respetando las cadenas.
 * Un recorrido de un solo paso en lugar de expresiones regulares: es lineal y no tiene retroceso.
 * Así, nombrar un procedimiento en un comentario no cuenta como cubrirlo con una prueba.
 */
export function stripSqlComments(sql: string): string {
  let result = '';
  let index = 0;

  while (index < sql.length) {
    const chunk = readChunk(sql, index);
    result += chunk.text;
    index = chunk.next;
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
