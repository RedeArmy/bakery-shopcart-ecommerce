// Lint de nombres de archivo SQL. La Etapa 2 amplía este stub con nomenclatura de objetos,
// cabecera de versión obligatoria y tipos prohibidos (FLOAT, REAL, MONEY).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Rule {
  directory: string;
  pattern: RegExp;
  example: string;
}

// El descriptor va en snake_case; los objetos conservan los prefijos SP_, VW_, FU_ y TR_ del enunciado
const RULES: readonly Rule[] = [
  {
    directory: 'db/migrations',
    pattern: /^V\d{4}__[a-z0-9_]+\.sql$/,
    example: 'V0001__create_core_tables.sql',
  },
  { directory: 'db/seed', pattern: /^S\d{4}__[a-z0-9_]+\.sql$/, example: 'S0001__seed_roles.sql' },
  {
    directory: 'db/objects/functions',
    pattern: /^R\d{4}__FU_[A-Z][A-Za-z]+_[A-Z][A-Za-z]+\.sql$/,
    example: 'R0050__FU_Money_HalfEvenDivision.sql',
  },
  {
    directory: 'db/objects/views',
    pattern: /^R\d{4}__VW_[A-Z][A-Za-z]+_[A-Z][A-Za-z]+\.sql$/,
    example: 'R0070__VW_Reconciliation_Amounts.sql',
  },
  {
    directory: 'db/objects/procedures',
    pattern: /^R\d{4}__SP_[A-Z][A-Za-z]+_[A-Z][A-Za-z]+\.sql$/,
    example: 'R0101__SP_Orders_CreateOrder.sql',
  },
  {
    directory: 'db/objects/triggers',
    pattern: /^R\d{4}__TR_[A-Z][A-Za-z]+_[A-Z][A-Za-z]+\.sql$/,
    example: 'R0030__TR_Orders_AmountsImmutable.sql',
  },
  {
    // El prefijo numérico fija el orden de ejecución de las clases de pruebas tSQLt
    directory: 'db/tests/tsqlt',
    pattern: /^\d{3}_Test_[A-Z][A-Za-z]+\.sql$/,
    example: '010_Test_Money.sql',
  },
];

export function findNamingProblems(directory: string, files: string[], rule: Rule): string[] {
  return files
    .filter((file) => file.endsWith('.sql') && !rule.pattern.test(file))
    .map(
      (file) =>
        `${join(directory, file)} does not match ${rule.pattern} (example: ${rule.example})`,
    );
}

const problems = RULES.flatMap((rule) => {
  const files = readdirSync(rule.directory);
  return findNamingProblems(rule.directory, files, rule);
});

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log('SQL file names OK.');
