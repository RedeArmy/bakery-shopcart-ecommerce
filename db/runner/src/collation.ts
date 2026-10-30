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
