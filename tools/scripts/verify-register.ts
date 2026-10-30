// Comprueba que el registro de migraciones está al día con los archivos de db/migrations y db/seed.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checksumOf } from '../../db/runner/src/checksum.js';
import { findRegisterProblems, type RegisteredFile } from './lib/migration-register.js';

const REGISTER = 'docs/database/migration-register.md';
const DIRECTORIES = ['db/migrations', 'db/seed'];

const files: RegisteredFile[] = DIRECTORIES.flatMap((directory) =>
  readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => ({ name, checksum: checksumOf(readFileSync(join(directory, name), 'utf8')) })),
);

const problems = findRegisterProblems(readFileSync(REGISTER, 'utf8'), files);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\nUpdate ${REGISTER} in the same pull request as the file.`);
  process.exit(1);
}
console.log(`Migration register matches ${files.length} scripts.`);
