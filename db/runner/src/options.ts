// Opciones de la base de datos que el sistema necesita. ALTER DATABASE ... SET no puede ejecutarse dentro de la transacción en
// la que el runner aplica cada script, así que no son una migración: las aplica el runner al preparar la base y "verify" las
// comprueba. La decisión de qué falta se toma aquí, sin conexión, para poder probarla.

export interface DatabaseOptions {
  /** READ_COMMITTED_SNAPSHOT: los lectores ven la última versión confirmada en lugar de esperar a los escritores */
  readCommittedSnapshot: boolean;
  /** Query Store: historial de planes y de consultas lentas, la herramienta para diagnosticar una regresión */
  queryStore: boolean;
  /** PAGE_VERIFY: CHECKSUM detecta una página dañada en el disco */
  pageVerify: string;
}

export type DatabaseOptionName = 'READ_COMMITTED_SNAPSHOT' | 'QUERY_STORE' | 'PAGE_VERIFY';

/** Lo que falta por aplicar, en el orden en que se aplica. */
export function pendingOptions(actual: DatabaseOptions): DatabaseOptionName[] {
  const pending: DatabaseOptionName[] = [];
  if (!actual.readCommittedSnapshot) pending.push('READ_COMMITTED_SNAPSHOT');
  if (!actual.queryStore) pending.push('QUERY_STORE');
  if (actual.pageVerify.toUpperCase() !== 'CHECKSUM') pending.push('PAGE_VERIFY');
  return pending;
}

/** Sentencia de cada opción. Son constantes del código: el nombre de la base se añade aparte con QUOTENAME. */
export const OPTION_CLAUSES: Readonly<Record<DatabaseOptionName, string>> = {
  // Esperar hasta 30 segundos a que terminen las demás sesiones y deshacer lo que siga abierto: ALTER DATABASE exige que no haya
  // otras conexiones, y sin esa espera fallaría contra un backend en marcha. Solo ocurre una vez, al activar la opción.
  READ_COMMITTED_SNAPSHOT: 'SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK AFTER 30 SECONDS',
  QUERY_STORE: 'SET QUERY_STORE = ON (OPERATION_MODE = READ_WRITE, QUERY_CAPTURE_MODE = AUTO)',
  PAGE_VERIFY: 'SET PAGE_VERIFY CHECKSUM',
};

/** Mensaje de "verify" para una opción que falta. */
export function describePending(name: DatabaseOptionName, database: string): string {
  return `${database} does not have ${name} on; run npm run db:migrate to apply it.`;
}
