import { z } from 'zod';

// Un valor vacío en .env significa "no configurado" (por ejemplo, REQUIRED_SCHEMA_VERSION=)
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1).default('ShopCart'),
  DB_APP_USER: z.string().min(1),
  DB_APP_PASSWORD: z.string().min(1),

  CORS_ORIGINS: z
    .string()
    .min(1)
    .default('http://localhost:8080')
    .transform((value) => value.split(',').map((origin) => origin.trim())),
  APP_PUBLIC_URL: z.url(),
  REQUIRED_SCHEMA_VERSION: z.preprocess(blankToUndefined, z.coerce.number().int().optional()),
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
