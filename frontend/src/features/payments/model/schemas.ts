import { z } from 'zod';
import { isDateOnly } from '../../../shared/lib/date';

/** Mismo tope que el servidor (5 MB); aquí solo avisa antes de subir, el servidor revisa el archivo de verdad. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'application/pdf'];

// Los mensajes son claves de i18n; el monto es texto con dos decimales, nunca un número
export const proofSchema = z.object({
  referenceNumber: z
    .string()
    .trim()
    .min(1, 'payment.proof.validation.referenceRequired')
    .max(40, 'payment.proof.validation.referenceTooLong'),
  depositDate: z.string().refine(isDateOnly, 'payment.proof.validation.dateRequired'),
  depositedAmount: z
    .string()
    .trim()
    .regex(/^\d{1,16}\.\d{2}$/, 'payment.proof.validation.amountInvalid'),
});

export type ProofValues = z.infer<typeof proofSchema>;

/** Clave de i18n del problema del archivo, o `null` si sirve. */
export function proofFileProblem(file: File | null): string | null {
  if (file === null) return 'payment.proof.validation.fileRequired';
  if (!PROOF_TYPES.includes(file.type)) return 'payment.proof.validation.fileType';
  if (file.size > MAX_PROOF_BYTES) return 'payment.proof.validation.fileTooBig';
  return null;
}
