import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CHECKSUM_FILE = 'SHA256SUMS';

// Formato de "sha256sum": 64 caracteres hexadecimales, un espacio y un asterisco (modo binario) o un espacio
const CHECKSUM_LINE = /^([0-9a-f]{64}) [ *](.+)$/;

export interface ChecksumEntry {
  hash: string;
  name: string;
}

/** Lee el contenido de un archivo SHA256SUMS y separa las líneas válidas de las mal formadas. */
export function parseChecksums(text: string): { entries: ChecksumEntry[]; malformed: string[] } {
  const entries: ChecksumEntry[] = [];
  const malformed: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const match = CHECKSUM_LINE.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      entries.push({ hash: match[1], name: match[2] });
    } else {
      malformed.push(line);
    }
  }
  return { entries, malformed };
}

/**
 * Verifica una carpeta de archivos de terceros contra su SHA256SUMS.
 * Los hashes se calculan sobre los bytes exactos: por eso Git no debe convertir sus finales de línea.
 */
export function verifyDirectory(directory: string): string[] {
  const listPath = join(directory, CHECKSUM_FILE);
  if (!existsSync(listPath)) return [`${listPath} is missing`];

  const problems: string[] = [];
  const { entries, malformed } = parseChecksums(readFileSync(listPath, 'utf8'));
  for (const line of malformed) problems.push(`${listPath}: malformed line "${line}"`);

  for (const { hash, name } of entries) {
    const filePath = join(directory, name);
    if (!existsSync(filePath)) {
      problems.push(`${filePath} is listed but missing`);
      continue;
    }
    const actual = createHash('sha256').update(readFileSync(filePath)).digest('hex');
    if (actual !== hash) {
      problems.push(`${filePath} does not match its checksum (expected ${hash}, got ${actual})`);
    }
  }

  // Un archivo nuevo sin checksum podría colarse sin revisión: todo debe estar listado (salvo la documentación)
  const listed = new Set(entries.map((entry) => entry.name));
  for (const file of readdirSync(directory)) {
    if (file === CHECKSUM_FILE || file.endsWith('.md')) continue;
    if (!listed.has(file))
      problems.push(`${join(directory, file)} is not listed in ${CHECKSUM_FILE}`);
  }
  return problems;
}
