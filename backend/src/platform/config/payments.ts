import { z } from 'zod';

// Un valor vacío en .env significa "no configurado": sin credenciales solo se ofrece depósito bancario
const blank = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const paymentsEnvSchema = z.object({
  RECURRENTE_PUBLIC_KEY: z.preprocess(
    blank,
    z
      .string()
      .regex(/^pk_(test|live)_/)
      .optional(),
  ),
  RECURRENTE_SECRET_KEY: z.preprocess(
    blank,
    z
      .string()
      .regex(/^sk_(test|live)_/)
      .optional(),
  ),
  RECURRENTE_WEBHOOK_SECRET: z.preprocess(blank, z.string().startsWith('whsec_').optional()),
  RECURRENTE_BASE_URL: z.url().default('https://app.recurrente.com/api'),
  PAYMENTS_CARD_ENABLED: z.enum(['true', 'false']).default('true'),
  PAYMENT_PROOFS_DIR: z.string().default('/data/payment-proofs'),
  PAYMENT_PROOF_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
});

export type PaymentsEnv = z.infer<typeof paymentsEnvSchema>;
