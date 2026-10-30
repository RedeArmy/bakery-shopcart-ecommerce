import { createHash } from 'node:crypto';

const BYTE_ORDER_MARK = '\uFEFF';

/**
 * Normaliza el texto de un script antes de calcular su checksum: sin marca BOM y con fin de línea LF.
 * Así el mismo archivo da el mismo SHA-256 en Windows (CRLF) y en Linux (LF).
 */
export function normalise(text: string): string {
  const withoutBom = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  return withoutBom.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Checksum de un script, calculado sobre su contenido normalizado. */
export function checksumOf(text: string): string {
  return sha256(normalise(text));
}
