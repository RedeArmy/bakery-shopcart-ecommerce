/**
 * Adónde llevar al cliente después de iniciar sesión: a donde iba cuando se le pidió ingresar. Solo se aceptan rutas de
 * esta misma aplicación (que empiezan por una sola barra) para que un enlace manipulado no pueda sacar al cliente del sitio.
 */
export function redirectTarget(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return '/';
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return '/';
  if (from === '/login' || from === '/register') return '/';
  return from;
}
