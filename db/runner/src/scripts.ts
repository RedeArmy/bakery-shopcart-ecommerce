import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checksumOf, normalise } from './checksum.js';
import { MigrationError } from './errors.js';
import { OBJECT_KINDS, parseObjectHeader, type ObjectHeader, type ObjectType } from './header.js';

export type ScriptType = 'V' | 'R' | 'S';

export interface ObjectInfo extends ObjectHeader {
  type: ObjectType;
}

export interface ScriptFile {
  type: ScriptType;
  number: number;
  fileName: string;
  description: string;
  /** Contenido con fin de línea LF: es el que se envía al servidor y el que se resume */
  content: string;
  checksum: string;
  /** Solo en los objetos programables (R) */
  object?: ObjectInfo;
}

// Prefijo (V, R o S), cuatro dígitos, doble guion bajo y descriptor; la extensión se quita antes
const NAME_PATTERN = /^([VRS])(\d{4})__(\w+)$/;
const SQL_EXTENSION = '.sql';
const TYPE_ORDER: Readonly<Record<ScriptType, number>> = { V: 0, R: 1, S: 2 };

export function parseScriptName(
  fileName: string,
): { type: ScriptType; number: number; description: string } | undefined {
  if (!fileName.endsWith(SQL_EXTENSION)) return undefined;
  const match = NAME_PATTERN.exec(fileName.slice(0, -SQL_EXTENSION.length));
  const [, type, digits, description] = match ?? [];
  if (type === undefined || digits === undefined || description === undefined) return undefined;
  return { type: type as ScriptType, number: Number(digits), description };
}

function readSqlFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith(SQL_EXTENSION))
    .sort((a, b) => a.localeCompare(b));
}

function load(directory: string, fileName: string, expected: ScriptType): ScriptFile {
  const parsed = parseScriptName(fileName);
  if (parsed?.type !== expected) {
    throw new MigrationError(
      'INVALID_SCRIPT_NAME',
      `${join(directory, fileName)} does not follow the ${expected}####__descriptor.sql pattern`,
    );
  }
  const content = normalise(readFileSync(join(directory, fileName), 'utf8'));
  return { ...parsed, fileName, content, checksum: checksumOf(content) };
}

function withObject(script: ScriptFile, kind: string): ScriptFile {
  const definition = OBJECT_KINDS[kind];
  if (definition === undefined) throw new Error(`Unknown object folder "${kind}"`);

  const header = parseObjectHeader(script.content, script.fileName);
  const expectedName = `dbo.${script.description}`;
  if (!script.description.startsWith(definition.prefix) || header.name !== expectedName) {
    throw new MigrationError(
      'INVALID_OBJECT_HEADER',
      `${script.fileName}: the header must declare "${expectedName}" and the name must start with ${definition.prefix}, got "${header.name}"`,
    );
  }
  return { ...script, object: { ...header, type: definition.type } };
}

function rejectDuplicates(scripts: readonly ScriptFile[]): void {
  const numbers = new Set<string>();
  const objects = new Set<string>();
  for (const script of scripts) {
    const key = `${script.type}${script.number}`;
    if (numbers.has(key)) {
      throw new MigrationError(
        'DUPLICATE_SCRIPT_NUMBER',
        `${script.fileName}: the number ${script.type}${String(script.number).padStart(4, '0')} is used twice`,
      );
    }
    numbers.add(key);

    const name = script.object?.name;
    if (name === undefined) continue;
    if (objects.has(name)) {
      throw new MigrationError('DUPLICATE_OBJECT', `${script.fileName}: ${name} is defined twice`);
    }
    objects.add(name);
  }
}

/**
 * Lee todos los scripts de la carpeta db y los devuelve en el orden de ejecución:
 * primero las migraciones, luego los objetos programables y al final las semillas.
 */
export function discoverScripts(databaseRoot: string): ScriptFile[] {
  const migrationsDirectory = join(databaseRoot, 'migrations');
  const seedDirectory = join(databaseRoot, 'seed');

  const migrations = readSqlFiles(migrationsDirectory).map((file) =>
    load(migrationsDirectory, file, 'V'),
  );
  const seeds = readSqlFiles(seedDirectory).map((file) => load(seedDirectory, file, 'S'));
  const objects = Object.keys(OBJECT_KINDS).flatMap((kind) => {
    const directory = join(databaseRoot, 'objects', kind);
    return readSqlFiles(directory).map((file) => withObject(load(directory, file, 'R'), kind));
  });

  const all = [...migrations, ...objects, ...seeds];
  rejectDuplicates(all);
  return all.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.number - b.number);
}
