// Superficie pública del módulo auth: ningún otro módulo puede importar nada más que este archivo
import type { RequestHandler, Router } from 'express';
import type { ProcedureExecutor } from '../../platform/db/execute-procedure.js';
import type { PasswordHasher } from '../../platform/security/passwords.js';
import type { TokenService } from '../../platform/security/tokens.js';
import type { Clock } from '../../shared-kernel/index.js';
import { AuthService } from './application/auth-service.js';
import { createSqlAuthRepository } from './infrastructure/sql-auth-repository.js';
import { createAuthRouter } from './presentation/auth.routes.js';

export { AuthService } from './application/auth-service.js';
export type { AuthRepositoryPort } from './application/auth-service.js';
export { createAuthRouter } from './presentation/auth.routes.js';

export interface AuthModuleDependencies {
  execute: ProcedureExecutor;
  hasher: PasswordHasher;
  tokens: TokenService;
  clock: Clock;
  accessMinutes: number;
  authenticate: RequestHandler;
  limitAuthentication: RequestHandler;
  limitRefresh: RequestHandler;
}

/** Cablea el módulo: el repositorio SQL, el servicio y las rutas. La raíz de composición solo monta el router. */
export function createAuthModule(deps: AuthModuleDependencies): { router: Router } {
  const service = new AuthService(
    createSqlAuthRepository(deps.execute),
    deps.hasher,
    deps.tokens,
    deps.clock,
    deps.accessMinutes,
  );
  return {
    router: createAuthRouter({
      service,
      authenticate: deps.authenticate,
      limitAuthentication: deps.limitAuthentication,
      limitRefresh: deps.limitRefresh,
    }),
  };
}
