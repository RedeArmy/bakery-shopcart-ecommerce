import { MigrationError } from './errors.js';
import { parseVersion } from './semver.js';

export type ObjectType = 'P' | 'V' | 'IF' | 'TR';

export interface ObjectHeader {
  /** Nombre con esquema, por ejemplo dbo.SP_Orders_CreateOrder */
  name: string;
  version: string;
  change: string;
}

const CHANGE_MAX_LENGTH = 300;

/** Prefijo del nombre del objeto y tipo de sys.objects que le corresponde. */
export const OBJECT_KINDS: Readonly<Record<string, { prefix: string; type: ObjectType }>> = {
  functions: { prefix: 'FU_', type: 'IF' },
  views: { prefix: 'VW_', type: 'V' },
  procedures: { prefix: 'SP_', type: 'P' },
  triggers: { prefix: 'TR_', type: 'TR' },
};

/**
 * Lee la cabecera obligatoria de un objeto (Objeto, Version y Cambio) del primer comentario de bloque.
 * Se recorre línea a línea en lugar de usar una expresión regular grande para evitar el retroceso.
 */
export function parseObjectHeader(sqlText: string, fileName: string): ObjectHeader {
  const start = sqlText.indexOf('/*');
  const end = start === -1 ? -1 : sqlText.indexOf('*/', start);
  if (start === -1 || end === -1) {
    throw new MigrationError('INVALID_OBJECT_HEADER', `${fileName}: the version header is missing`);
  }

  const fields = new Map<string, string>();
  for (const line of sqlText.slice(start + 2, end).split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    if (!fields.has(key)) fields.set(key, line.slice(colon + 1).trim());
  }

  const name = fields.get('objeto') ?? '';
  const version = fields.get('version') ?? '';
  const change = fields.get('cambio') ?? '';

  if (name === '') {
    throw new MigrationError('INVALID_OBJECT_HEADER', `${fileName}: the header has no "Objeto"`);
  }
  if (parseVersion(version) === undefined) {
    throw new MigrationError(
      'INVALID_OBJECT_HEADER',
      `${fileName}: "Version" must look like 1.0.0, got "${version}"`,
    );
  }
  if (change === '' || change.length > CHANGE_MAX_LENGTH) {
    throw new MigrationError(
      'INVALID_OBJECT_HEADER',
      `${fileName}: "Cambio" must have between 1 and ${CHANGE_MAX_LENGTH} characters`,
    );
  }
  return { name, version, change };
}
