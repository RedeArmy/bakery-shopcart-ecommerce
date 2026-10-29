// Mantiene sincronizados README.md (español, principal) y README.en.md (inglés británico).
import { existsSync, readFileSync } from 'node:fs';
import { compareReadmes } from './lib/readme-sync.js';

const SPANISH = 'README.md';
const ENGLISH = 'README.en.md';

const missing = [SPANISH, ENGLISH].filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`Missing file(s): ${missing.join(', ')}`);
  process.exit(1);
}

const problems = compareReadmes(readFileSync(SPANISH, 'utf8'), readFileSync(ENGLISH, 'utf8'));
if (problems.length > 0) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log('README.md and README.en.md are in sync.');
