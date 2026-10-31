export type MigrationErrorCode =
  | 'INVALID_SCRIPT_NAME'
  | 'DUPLICATE_SCRIPT_NUMBER'
  | 'INVALID_OBJECT_HEADER'
  | 'DUPLICATE_OBJECT'
  | 'MIGRATION_DRIFT'
  | 'MIGRATION_MISSING'
  | 'MIGRATION_OUT_OF_ORDER'
  | 'OBJECT_VERSION_NOT_RAISED'
  | 'OBJECT_VERSION_LOWERED'
  | 'OBJECT_NOT_CREATED'
  | 'LOCK_NOT_ACQUIRED'
  | 'COLLATION_MISMATCH'
  | 'SERVER_SHUT_DOWN';

/** Error esperado del runner, con un código estable para los registros y las pruebas. */
export class MigrationError extends Error {
  constructor(
    readonly code: MigrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}
