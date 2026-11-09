import { landingPath } from '../../../shared/auth';
import type { Role } from '../../../shared/auth';

/**
 * Adónde llevar a quien acaba de iniciar sesión: a donde iba cuando se le pidió ingresar o, si venía sin destino, a la pantalla con
 * la que empieza su rol (el personal, su panel; el cliente, la tienda). Solo se aceptan rutas de esta misma aplicación (que
 * empiezan por una sola barra) para que un enlace manipulado no pueda sacar a la persona del sitio.
 */
export function redirectTarget(state: unknown, role?: Role | null): string {
  const landing = landingPath(role);
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return landing;
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return landing;
  if (from === '/login' || from === '/register') return landing;
  return from;
}
