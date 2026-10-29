// Verifica que identificadores, nombres de archivo y Markdown usen ortografía británica.
// Los comentarios de código se escriben en español y se excluyen del análisis.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { listRepositoryFiles } from './lib/git.js';
import { findPathViolations, findViolations } from './lib/spelling.js';
import { EXCLUDED_PATHS, SCANNED_EXTENSIONS } from './lib/spelling-rules.js';

const files = listRepositoryFiles().filter(
  (file) => !EXCLUDED_PATHS.some((pattern) => pattern.test(file)),
);

let failures = 0;
const report = (file: string, line: number, found: string, suggestion: string): void => {
  failures += 1;
  console.error(`${file}:${line}  "${found}" -> use "${suggestion}"`);
};

for (const file of files) {
  for (const segment of file.split('/')) {
    for (const violation of findPathViolations(segment)) {
      report(file, 0, violation.found, violation.suggestion);
    }
  }
  const extension = extname(file);
  if (!SCANNED_EXTENSIONS.includes(extension)) continue;
  for (const violation of findViolations(readFileSync(file, 'utf8'), extension)) {
    report(file, violation.line, violation.found, violation.suggestion);
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} British spelling violation(s). See docs/adr/0024-language-and-spelling-conventions.md`,
  );
  process.exit(1);
}
console.log(`British spelling check passed (${files.length} files).`);
