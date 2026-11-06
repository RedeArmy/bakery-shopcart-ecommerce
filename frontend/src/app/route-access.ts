import type { Role, SessionState } from '../shared/auth';

export type RouteAccess = 'wait' | 'login' | 'forbidden' | 'allow';

/**
 * Qué hacer con quien entra a una ruta protegida. La decisión es pura para poder probarla sin React; el componente solo
 * la traduce a una pantalla. Los permisos reales siempre los decide el backend: esto solo evita mostrar lo que fallaría.
 */
export function routeAccess(session: SessionState, roles?: readonly Role[]): RouteAccess {
  if (session.status === 'unknown') return 'wait';
  if (session.status === 'anonymous' || session.user === null) return 'login';
  if (roles !== undefined && !roles.includes(session.user.role)) return 'forbidden';
  return 'allow';
}
