// Comprueba que el código de terceros incluido en el repositorio no se haya modificado ni corrompido.
import { verifyDirectory } from './lib/checksums.js';

// Carpetas con archivos de terceros fijados por versión y checksum
const VENDORED_DIRECTORIES = ['db/tests/tsqlt/install'];

const problems = VENDORED_DIRECTORIES.flatMap((directory) => verifyDirectory(directory));

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    '\nVendored files must match SHA256SUMS. See the README of the folder to upgrade them.',
  );
  process.exit(1);
}
console.log(
  `Vendored files verified against their checksums (${VENDORED_DIRECTORIES.length} folder).`,
);
