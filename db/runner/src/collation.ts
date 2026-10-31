/**
 * Collation de la base de datos del proyecto (ADR-0025).
 * CI = no distingue mayúsculas (los correos y los nombres únicos no se duplican por la capitalización),
 * AS = distingue acentos ("Té" y "Te" son nombres distintos), SC = reconoce los caracteres suplementarios
 * (un emoji en una dedicatoria cuenta como un carácter y no como dos). La búsqueda sin acentos se pide
 * en el procedimiento con un COLLATE explícito, no cambiando la integridad de los datos.
 */
export const DATABASE_COLLATION = 'Latin1_General_100_CI_AS_SC';

export interface CollationFindings {
  /** La base de datos no usa el collation del proyecto: hay que detener la migración */
  error?: string;
  /** El servidor (y por tanto tempdb) usa otro: los #temp con texto necesitan COLLATE DATABASE_DEFAULT */
  warning?: string;
}

/** Compara el collation real de la base de datos y del servidor con el del proyecto. */
export function assessCollation(
  actual: { database: string; server: string },
  databaseName: string,
  expected: string = DATABASE_COLLATION,
): CollationFindings {
  const findings: CollationFindings = {};
  if (actual.database !== expected) {
    findings.error =
      `${databaseName} uses the collation ${actual.database} but the project requires ${expected}. ` +
      'Changing the collation of a database that already has data does not change its existing columns, ' +
      'so recreate the database (locally: docker compose down --volumes) and run the migrations again.';
  }
  if (actual.server !== expected) {
    findings.warning =
      `The server collation is ${actual.server}, not ${expected}. Temporary tables take the server collation: ` +
      'declare their text columns with COLLATE DATABASE_DEFAULT (see docs/database/naming-standard.md).';
  }
  return findings;
}

/** Lo que el servidor dice de su propio arranque; se lee de SQL Server y se decide aquí, sin conexión, para poder probarlo. */
export interface ServerStartup {
  /** El registro del servidor contiene "Attempting to change default collation" */
  collationChangeStarted: boolean;
  /** El registro del servidor contiene "The default collation was successfully changed" */
  collationChangeFinished: boolean;
  serverCollation: string;
  uptimeSeconds: number;
}

/**
 * Un servidor recién creado con MSSQL_COLLATION acepta conexiones y ejecuta, ya dentro del proceso, el cambio de collation
 * por defecto (unos 10 segundos). Crear una base de datos en esa ventana hace que el cambio falle con el error 3434 y que el
 * servidor se detenga. Ni "responde a una consulta" ni "msdb en línea" ni el valor de SERVERPROPERTY('Collation') (que ya
 * muestra el collation nuevo cuando el cambio EMPIEZA) indican que terminó: solo lo dice el registro del servidor.
 */
export const STARTUP_GRACE_SECONDS = 120;

export function isServerInitialising(
  startup: ServerStartup,
  expected: string = DATABASE_COLLATION,
): boolean {
  // El cambio ya empezó y todavía no terminó
  if (startup.collationChangeStarted && !startup.collationChangeFinished) return true;
  // Un servidor joven con otro collation puede estar a punto de empezar el cambio (el registro aún no lo dice). Pasada la
  // gracia se asume que es un servidor configurado a propósito con otro collation: la base de datos se crea con el suyo.
  return (
    startup.serverCollation.toLowerCase() !== expected.toLowerCase() &&
    startup.uptimeSeconds < STARTUP_GRACE_SECONDS
  );
}

/** Pausa entre las dos lecturas que confirman que el servidor ya terminó de arrancar. */
export const SETTLE_CONFIRMATION_MS = 1500;

// Errores de SQL Server por falta de permisos: 229/230 (EXECUTE/columna), 262 (CREATE TABLE), 297 y 300 (VIEW SERVER STATE)
// y 15003 (solo sysadmin). Son los únicos que significan "no puedo leer el registro", que no es lo mismo que "el servidor
// está listo": un interbloqueo, un tiempo agotado o una conexión cortada durante el cambio de collation son transitorios.
const PERMISSION_DENIED_ERRORS: ReadonlySet<number> = new Set([229, 230, 262, 297, 300, 15003]);

/** Distingue "no tengo permiso para leer el registro" de cualquier otro fallo de la consulta. */
export function isPermissionDenied(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { number } = error as { number?: unknown };
  return typeof number === 'number' && PERMISSION_DENIED_ERRORS.has(number);
}

/**
 * Da el servidor por asentado solo si dos lecturas separadas por una pausa coinciden. Una lectura aislada puede caer justo
 * entre el inicio del cambio de collation y la línea del registro que lo anuncia; la segunda cierra esa ventana. Si leer falla
 * por un error que no es de permisos, el error sube: el llamador reintenta en lugar de suponer que todo está bien.
 * `read` devuelve undefined cuando el registro no se puede leer por permisos: el servidor no es uno recién creado por el
 * repositorio y no hay nada que esperar.
 */
export async function confirmServerSettled(
  read: () => Promise<ServerStartup | undefined>,
  pause: (ms: number) => Promise<void>,
  expected: string = DATABASE_COLLATION,
): Promise<void> {
  for (const sample of [1, 2]) {
    const startup = await read();
    if (startup === undefined) return;
    if (isServerInitialising(startup, expected)) {
      throw new Error('The server is still finishing its first start.');
    }
    if (sample === 1) await pause(SETTLE_CONFIRMATION_MS);
  }
}

// 3434: el cambio de collation por defecto no puede hacerse con otras bases creándose y el servidor se apaga; 6005: apagado en curso
const SHUTDOWN_ERRORS: ReadonlySet<number> = new Set([3434, 6005]);
const CONNECTION_LOST_CODES: ReadonlySet<string> = new Set(['ECONNCLOSED', 'ESOCKET']);

/** El servidor se apagó o cortó la conexión mientras se le pedía crear la base de datos. */
export function isServerShutdown(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { number, code } = error as { number?: unknown; code?: unknown };
  return (
    (typeof number === 'number' && SHUTDOWN_ERRORS.has(number)) ||
    (typeof code === 'string' && CONNECTION_LOST_CODES.has(code))
  );
}
