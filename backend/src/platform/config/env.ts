import { z } from 'zod';
import { paymentsEnvSchema } from './payments.js';

// Un valor vacío en .env significa "no configurado" (por ejemplo, DB_TRUST_SERVER_CERTIFICATE=)
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z.object({
  ...paymentsEnvSchema.shape,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1).default('ShopCart'),
  DB_APP_USER: z.string().min(1),
  DB_APP_PASSWORD: z.string().min(1),
  // Sin valor: se confía en el certificado autofirmado del contenedor de desarrollo, pero nunca en producción
  DB_TRUST_SERVER_CERTIFICATE: z.preprocess(blankToUndefined, z.stringbool().optional()),

  CORS_ORIGINS: z
    .string()
    .min(1)
    .default('http://localhost:8080')
    .transform((value) => value.split(',').map((origin) => origin.trim())),
  APP_PUBLIC_URL: z.url(),

  // Los secretos los genera npm run up en el .env local; aquí solo se exige que no estén vacíos ni sean triviales
  JWT_ACCESS_SECRET: z.string().min(24),
  JWT_REFRESH_PEPPER: z.string().min(24),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),

  // Trabajos de fondo (vencimiento, purga, conciliación). Un valor vacío del .env significa "el predeterminado"
  JOBS_ENABLED: z.preprocess(blankToUndefined, z.stringbool().default(true)),
  JOB_EXPIRE_SECONDS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(10).max(3600).default(60),
  ),
  JOB_PURGE_HOURS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(168).default(24),
  ),
  JOB_RECONCILE_HOURS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(168).default(24),
  ),
});

export type Env = z.infer<typeof envSchema>;

/** Valida las variables de entorno al arrancar: el proceso falla rápido si la configuración es inválida. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  return parsed.data;
}
