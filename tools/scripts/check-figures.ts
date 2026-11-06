// cspell:ignore datos pruebas procedimientos peticiones operaciones migraciones funciones flujos aserciones Flujos
// Falla si una cifra de los README (pruebas, procedimientos, operaciones de la API...) ya no coincide con el repositorio.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkFigures,
  countIntegrationFlows,
  countOperations,
  countPostman,
  countTsqltTests,
} from './lib/figures.js';
import type { FigureRule } from './lib/figures.js';

const SPANISH = 'README.md';
const ENGLISH = 'README.en.md';

const read = (path: string): string => readFileSync(path, 'utf8');
const sqlFiles = (directory: string, prefix = ''): string[] =>
  readdirSync(directory).filter((name) => name.startsWith(prefix) && name.endsWith('.sql'));
const both = (spanish: RegExp, english: RegExp) => [
  { file: SPANISH, regex: spanish },
  { file: ENGLISH, regex: english },
];

const postman = countPostman(
  JSON.parse(read('docs/api/postman/ShopCart.postman_collection.json')) as { item: unknown[] },
);

const rules: FigureRule[] = [
  {
    label: 'tSQLt tests',
    actual: sqlFiles('db/tests/tsqlt').reduce(
      (total, name) => total + countTsqltTests(read(join('db/tests/tsqlt', name))),
      0,
    ),
    patterns: both(
      /(\d{1,5}) de base de datos \(tSQLt\)/,
      /(\d{1,5}) for the database \(tSQLt\)/,
    ).concat(both(/(\d{1,5}) pruebas de base de datos/, /(\d{1,5}) database tests/)),
  },
  {
    label: 'HTTP flows',
    actual: countIntegrationFlows(read('backend/tests/integration/api.test.ts')),
    patterns: both(/(\d{1,5}) flujos HTTP/, /(\d{1,5}) HTTP flows/).concat(
      both(
        /Flujos HTTP contra SQL Server \((\d{1,5})\)/,
        /HTTP flows against SQL Server \((\d{1,5})\)/,
      ),
    ),
  },
  {
    label: 'stored procedures',
    actual: sqlFiles('db/objects/procedures').length,
    patterns: both(/(\d{1,5}) procedimientos/, /(\d{1,5}) (?:stored )?procedures/).concat(
      both(/\((\d{1,5}) de \d{1,5}\)/, /\((\d{1,5}) of \d{1,5}\)/),
    ),
  },
  {
    label: 'table functions',
    actual: sqlFiles('db/objects/functions').length,
    patterns: both(/(\d{1,5}) funciones de tabla/, /(\d{1,5}) table functions/),
  },
  {
    label: 'views',
    actual: sqlFiles('db/objects/views').length,
    patterns: both(/(\d{1,5}) vistas/, /(\d{1,5}) views/),
  },
  {
    label: 'migrations',
    actual: sqlFiles('db/migrations', 'V').length,
    patterns: both(/(\d{1,5}) migraciones/, /(\d{1,5}) migrations/),
  },
  {
    label: 'API operations',
    actual: countOperations(read('docs/api/openapi/openapi.yaml')),
    patterns: both(/(\d{1,5}) operaciones/, /(\d{1,5})[ -]operations?/),
  },
  {
    label: 'Postman requests',
    actual: postman.requests,
    patterns: both(/(\d{1,5}) peticiones/, /(\d{1,5}) requests/),
  },
  {
    label: 'Postman assertions',
    actual: postman.assertions,
    patterns: both(/(\d{1,5}) aserciones/, /(\d{1,5}) assertions/),
  },
];

const problems = checkFigures({ [SPANISH]: read(SPANISH), [ENGLISH]: read(ENGLISH) }, rules);
if (problems.length > 0) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`README figures match the repository (${rules.length} rules).`);
