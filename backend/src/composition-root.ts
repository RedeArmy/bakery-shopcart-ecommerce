import type { Express } from 'express';
import { createAuditModule } from './modules/audit/index.js';
import { createAuthModule } from './modules/auth/index.js';
import { createCartModule } from './modules/cart/index.js';
import { createCatalogueModule } from './modules/catalogue/index.js';
import { createCheckoutModule } from './modules/checkout/index.js';
import { createCouponsModule } from './modules/coupons/index.js';
import { createInventoryModule } from './modules/inventory/index.js';
import { createOrdersModule } from './modules/orders/index.js';
import { createPaymentsModule } from './modules/payments/index.js';
import { createUsersModule } from './modules/users/index.js';
import type { Env } from './platform/config/env.js';
import { createExecutor } from './platform/db/executor.js';
import { createSqlIdempotencyStore } from './platform/db/idempotency-store.js';
import { createSqlJobs } from './platform/db/jobs-store.js';
import { createDatabase } from './platform/db/pool.js';
import type { Database } from './platform/db/pool.js';
import {
  REQUIRED_SCHEMA_VERSION,
  createSchemaVersionReader,
} from './platform/db/schema-version.js';
import { createApp } from './platform/http/app.js';
import { createAuthenticate, requireRole } from './platform/http/authentication.js';
import { createReadiness } from './platform/http/readiness.js';
import type { ReadinessReport } from './platform/http/readiness.js';
import type { RouteKit } from './platform/http/route-kit.js';
import { createIdempotency } from './platform/idempotency/idempotency.js';
import { buildJobs } from './platform/jobs/job-definitions.js';
import { createJobRunner } from './platform/jobs/job-runner.js';
import type { JobRunner } from './platform/jobs/job-runner.js';
import { createLogger } from './platform/logging/logger.js';
import type { Logger } from './platform/logging/logger.js';
import {
  POLICIES,
  createMemoryRateLimitStore,
  createRateLimiter,
} from './platform/rate-limit/rate-limit.js';
import { argon2PasswordHasher } from './platform/security/passwords.js';
import { createTokenService } from './platform/security/tokens.js';
import { createLocalDiskStorage } from './platform/storage/local-disk-storage.js';
import { systemClock } from './platform/system-clock.js';

export interface Container {
  app: Express;
  logger: Logger;
  database: Database;
  /** La misma comprobación que usa /health/ready; main.ts la ejecuta al arrancar para dejar constancia en el registro */
  checkReadiness: () => Promise<ReadinessReport>;
  /** Trabajos de fondo; main.ts los arranca y los detiene en el apagado */
  jobs: JobRunner;
}

export interface ContainerOptions {
  /** Solo para las pruebas de integración, que repiten el alta y el inicio de sesión más de cinco veces por minuto */
  disableRateLimit?: boolean;
}

/**
 * Único lugar donde se conectan las clases concretas (inyección de dependencias manual).
 * Construye la plataforma, el "kit" de rutas que comparten los módulos y monta cada módulo.
 */
export function buildContainer(env: Env, options: ContainerOptions = {}): Container {
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
  const limiter = createRateLimiter(createMemoryRateLimitStore(), clock);
  const rateLimit: typeof limiter =
    options.disableRateLimit === true
      ? () => (_req, _res, next) => {
          next();
        }
      : limiter;

  const kit: RouteKit = {
    execute,
    clock,
    authenticate: createAuthenticate(tokens),
    optionalAuthenticate: createAuthenticate(tokens, { optional: true }),
    rateLimit,
    idempotent: createIdempotency(createSqlIdempotencyStore(execute), logger),
    role: requireRole,
    proofMaxBytes: env.PAYMENT_PROOF_MAX_BYTES,
  };

  const auth = createAuthModule({
    execute,
    hasher: argon2PasswordHasher,
    tokens,
    clock,
    accessMinutes: env.ACCESS_TOKEN_MINUTES,
    authenticate: kit.authenticate,
    limitAuthentication: rateLimit(POLICIES.authentication),
    limitRefresh: rateLimit(POLICIES.refresh),
  });

  const jobs = createJobRunner({
    jobs: buildJobs(createSqlJobs(execute), {
      expireEverySeconds: env.JOB_EXPIRE_SECONDS,
      purgeEveryHours: env.JOB_PURGE_HOURS,
      reconcileEveryHours: env.JOB_RECONCILE_HOURS,
    }),
    logger,
    clock,
  });

  const routers = [
    auth.router,
    createCatalogueModule(kit).router,
    createCartModule(kit).router,
    createUsersModule(kit).router,
    // Fase 1: sin pasarela de tarjeta; la Fase 2 la activa con las credenciales de Recurrente
    createCheckoutModule(kit, { cardAvailable: false }).router,
    createOrdersModule(kit).router,
    createPaymentsModule(kit, createLocalDiskStorage(env.PAYMENT_PROOFS_DIR)).router,
    createInventoryModule(kit).router,
    createCouponsModule(kit).router,
    createAuditModule(kit, process.env['npm_package_version'] ?? 'unknown', () => jobs.status())
      .router,
  ];

  const app = createApp({
    env,
    logger,
    health: { checkReadiness },
    api: { routers, globalLimit: rateLimit(POLICIES.global) },
  });
  return { app, logger, database, checkReadiness, jobs };
}
