export type ProofMimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

const SIGNATURES: readonly { mime: ProofMimeType; bytes: readonly number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

/**
 * Tipo real del archivo por sus primeros bytes. Ni la extensión ni el Content-Type que declara el cliente cuentan:
 * son lo primero que se falsea.
 */
export function detectProofMime(data: Buffer): ProofMimeType | null {
  const found = SIGNATURES.find(({ bytes }) => bytes.every((byte, index) => data[index] === byte));
  return found?.mime ?? null;
}
