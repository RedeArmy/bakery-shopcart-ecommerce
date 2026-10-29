import { pino } from 'pino';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';

// Rutas que nunca deben aparecer en los logs: credenciales, tokens y llaves de la pasarela
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-secret-key"]',
  'req.headers["x-public-key"]',
  'req.headers["svix-signature"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.secretKey',
];

export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
  });
}

export type { Logger };
