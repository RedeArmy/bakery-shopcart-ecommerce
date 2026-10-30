import { MigrationError } from './errors.js';
import { compareVersions } from './semver.js';
import type { ScriptFile, ScriptType } from './scripts.js';

/** Última aplicación correcta de un script, tal como quedó en SchemaVersion. */
export interface AppliedScript {
  type: ScriptType;
  number: number;
  fileName: string;
  checksum: string;
}

/** Versión vigente de un objeto programable, tal como quedó en ObjectVersions. */
export interface CurrentObject {
  objectName: string;
  version: string;
  checksum: string;
  definitionChecksum: string;
}

export interface DatabaseState {
  scripts: AppliedScript[];
  objects: CurrentObject[];
}

const padded = (number: number): string => String(number).padStart(4, '0');

function planMigrations(
  scripts: readonly ScriptFile[],
  applied: readonly AppliedScript[],
): ScriptFile[] {
  const migrations = scripts.filter((script) => script.type === 'V');
  const appliedByNumber = new Map(
    applied.filter((item) => item.type === 'V').map((item) => [item.number, item]),
  );
  const onDisk = new Set(migrations.map((script) => script.number));

  for (const item of appliedByNumber.values()) {
    if (!onDisk.has(item.number)) {
      throw new MigrationError(
        'MIGRATION_MISSING',
        `${item.fileName} was applied but its file no longer exists`,
      );
    }
  }

  const highestApplied = Math.max(0, ...appliedByNumber.keys());
  const pending: ScriptFile[] = [];
  for (const script of migrations) {
    const previous = appliedByNumber.get(script.number);
    if (previous === undefined) {
      // Una migración nueva con número menor que otra ya aplicada rompería el orden reproducible
      if (script.number < highestApplied) {
        throw new MigrationError(
          'MIGRATION_OUT_OF_ORDER',
          `${script.fileName} is older than V${padded(highestApplied)}, which is already applied`,
        );
      }
      pending.push(script);
    } else if (previous.checksum !== script.checksum) {
      throw new MigrationError(
        'MIGRATION_DRIFT',
        `${script.fileName} changed after it was applied. Migrations are immutable: write a new one`,
      );
    }
  }
  return pending;
}

function planObjects(
  scripts: readonly ScriptFile[],
  current: readonly CurrentObject[],
): ScriptFile[] {
  const currentByName = new Map(current.map((item) => [item.objectName, item]));
  const pending: ScriptFile[] = [];

  for (const script of scripts) {
    const info = script.object;
    if (script.type !== 'R' || info === undefined) continue;

    const previous = currentByName.get(info.name);
    if (previous === undefined) {
      pending.push(script);
    } else if (previous.checksum !== script.checksum) {
      const order = compareVersions(info.version, previous.version);
      if (order === 0) {
        throw new MigrationError(
          'OBJECT_VERSION_NOT_RAISED',
          `${script.fileName} changed but its header version is still ${info.version}. Raise it`,
        );
      }
      if (order < 0) {
        throw new MigrationError(
          'OBJECT_VERSION_LOWERED',
          `${script.fileName} declares ${info.version}, lower than the applied ${previous.version}`,
        );
      }
      pending.push(script);
    }
  }
  return pending;
}

function planSeeds(
  scripts: readonly ScriptFile[],
  applied: readonly AppliedScript[],
): ScriptFile[] {
  const appliedChecksums = new Map(
    applied.filter((item) => item.type === 'S').map((item) => [item.number, item.checksum]),
  );
  // Las semillas son idempotentes (MERGE): si cambian, se vuelven a ejecutar
  return scripts.filter(
    (script) => script.type === 'S' && appliedChecksums.get(script.number) !== script.checksum,
  );
}

/**
 * Decide qué scripts faltan por ejecutar y rechaza los cambios peligrosos:
 * migraciones editadas (drift), fuera de orden o ausentes, y objetos modificados sin subir la versión.
 * Es una función pura: no toca la base de datos.
 */
export function planRun(scripts: readonly ScriptFile[], state: DatabaseState): ScriptFile[] {
  return [
    ...planMigrations(scripts, state.scripts),
    ...planObjects(scripts, state.objects),
    ...planSeeds(scripts, state.scripts),
  ];
}

/**
 * Lista los problemas de una base de datos ya migrada: scripts pendientes, deriva respecto a los archivos
 * y objetos cambiados fuera del runner. `liveDefinitions` asocia cada objeto con el resumen de su definición actual.
 */
export function findProblems(
  scripts: readonly ScriptFile[],
  state: DatabaseState,
  liveDefinitions: ReadonlyMap<string, string | null>,
): string[] {
  const problems: string[] = [];
  try {
    for (const script of planRun(scripts, state)) problems.push(`${script.fileName} is pending`);
  } catch (error) {
    if (!(error instanceof MigrationError)) throw error;
    problems.push(`${error.code}: ${error.message}`);
  }

  for (const item of state.objects) {
    const live = liveDefinitions.get(item.objectName);
    if (live === undefined || live === null) {
      problems.push(`OBJECT_MISSING: ${item.objectName} is recorded but does not exist`);
    } else if (live !== item.definitionChecksum) {
      problems.push(`OBJECT_MODIFIED: ${item.objectName} was changed outside the runner`);
    }
  }
  return problems;
}
