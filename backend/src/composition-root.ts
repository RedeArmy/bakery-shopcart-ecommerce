import type { Express } from 'express';
import type { Env } from './platform/config/env.js';
import { createAuthModule } from './modules/auth/index.js';
import { createExecutor } from './platform/db/executor.js';
import { createSqlIdempotencyStore } from './platform/db/idempotency-store.js';
import { createDatabase } from './platform/db/pool.js';
import { createAuthenticate } from './platform/http/authentication.js';
import { createIdempotency } from './platform/idempotency/idempotency.js';
import {
  POLICIES,
  createMemoryRateLimitStore,
  createRateLimiter,
} from './platform/rate-limit/rate-limit.js';
import { argon2PasswordHasher } from './platform/security/passwords.js';
import { createTokenService } from './platform/security/tokens.js';
import { systemClock } from './platform/system-clock.js';
import type { Database } from './platform/db/pool.js';
import {
  REQUIRED_SCHEMA_VERSION,
  createSchemaVersionReader,
} from './platform/db/schema-version.js';
import { createApp } from './platform/http/app.js';
import { createReadiness } from './platform/http/readiness.js';
import { createLogger } from './platform/logging/logger.js';
import type { ReadinessReport } from './platform/http/readiness.js';
import type { Logger } from './platform/logging/logger.js';

export interface Container {
  app: Express;
  logger: Logger;
  database: Database;
  /** La misma comprobación que usa /health/ready; main.ts la ejecuta al arrancar para dejar constancia en el registro */
  checkReadiness: () => Promise<ReadinessReport>;
  /** Piezas que los módulos siguientes necesitan para montar sus rutas */
  tokens: ReturnType<typeof createTokenService>;
  authenticate: ReturnType<typeof createAuthenticate>;
  rateLimit: ReturnType<typeof createRateLimiter>;
  idempotent: ReturnType<typeof createIdempotency>;
  execute: ReturnType<typeof createExecutor>;
}

/**
 * Único lugar donde se conectan las clases concretas (inyección de dependencias manual).
 * Por ahora solo cablea la plataforma; cada módulo se añade aquí cuando tenga casos de uso.
 */
export function buildContainer(env: Env): Container {
  const logger = createLogger(env);
  const database = createDatabase(env);
  const checkReadiness = createReadiness({
    checkConnection: () => database.checkConnection(),
    readSchemaVersion: createSchemaVersionReader(database),
    requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
    logger,
  });

  const clock = systemClock;
  const execute = createExecutor(database);
  const tokens = createTokenService(
    {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshPepper: env.JWT_REFRESH_PEPPER,
      accessMinutes: env.ACCESS_TOKEN_MINUTES,
      refreshDays: env.REFRESH_TOKEN_DAYS,
    },
    clock,
  );
  const authenticate = createAuthenticate(tokens);
  const rateLimit = createRateLimiter(createMemoryRateLimitStore(), clock);
  // Disponible para los módulos de pedidos y pagos, que lo ponen en sus rutas de escritura
  const idempotent = createIdempotency(createSqlIdempotencyStore(execute), logger);

  const auth = createAuthModule({
    execute,
    hasher: argon2PasswordHasher,
    tokens,
    clock,
    accessMinutes: env.ACCESS_TOKEN_MINUTES,
    authenticate,
    limitAuthentication: rateLimit(POLICIES.authentication),
    limitRefresh: rateLimit(POLICIES.refresh),
  });

  const app = createApp({
    env,
    logger,
    health: { checkReadiness },
    api: { routers: [auth.router], globalLimit: rateLimit(POLICIES.global) },
  });
  return {
    app,
    logger,
    database,
    checkReadiness,
    tokens,
    authenticate,
    rateLimit,
    idempotent,
    execute,
  };
}
