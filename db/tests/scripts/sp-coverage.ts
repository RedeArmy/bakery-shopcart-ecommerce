// Comprueba que cada procedimiento almacenado tiene al menos una prueba tSQLt que lo nombra.
// Es un análisis estático de los archivos: tSQLt se desinstala al terminar sql:test, así que la base ya no puede responder.
// Códigos de salida: 0 correcto, 1 falta la prueba de un procedimiento crítico, 2 error de la herramienta.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, extractProcedureNames, parseCriticalProcedures } from './lib/coverage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROCEDURES_DIRECTORY = join(ROOT, 'db/objects/procedures');
const TESTS_DIRECTORY = join(ROOT, 'db/tests/tsqlt');
const CATALOGUE = join(ROOT, 'docs/database/stored-procedure-catalogue.md');

// R0101__SP_Orders_CreateOrder.sql -> SP_Orders_CreateOrder
const PROCEDURE_FILE = /^R\d{4}__(SP_[A-Za-z0-9]+_[A-Za-z0-9]+)\.sql$/;

function existingProcedures(): string[] {
  if (!existsSync(PROCEDURES_DIRECTORY)) return [];
  return readdirSync(PROCEDURES_DIRECTORY)
    .map((file) => PROCEDURE_FILE.exec(file)?.[1])
    .filter((name): name is string => name !== undefined)
    .sort((a, b) => a.localeCompare(b));
}

function testedProcedures(): Set<string> {
  const tested = new Set<string>();
  for (const file of readdirSync(TESTS_DIRECTORY).filter((name) => name.endsWith('.sql'))) {
    for (const name of extractProcedureNames(readFileSync(join(TESTS_DIRECTORY, file), 'utf8'))) {
      tested.add(name);
    }
  }
  return tested;
}

function main(): number {
  if (!existsSync(CATALOGUE)) {
    console.error(`The procedure catalogue is missing: ${CATALOGUE}`);
    return 2;
  }

  const report = buildReport(
    existingProcedures(),
    parseCriticalProcedures(readFileSync(CATALOGUE, 'utf8')),
    testedProcedures(),
  );

  console.log(
    `Procedure coverage: ${report.covered} of ${report.total} procedures have a tSQLt test.`,
  );
  if (report.plannedCritical.length > 0) {
    console.log(
      `Critical procedures not built yet (${report.plannedCritical.length}): ${report.plannedCritical.join(', ')}`,
    );
  }
  for (const name of report.missingOther) console.warn(`warning: ${name} has no tSQLt test`);
  for (const name of report.missingCritical)
    console.error(`error: critical procedure ${name} has no tSQLt test`);

  return report.missingCritical.length > 0 ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
