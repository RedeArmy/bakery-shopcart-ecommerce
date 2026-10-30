import type { AppError, Result } from '../../shared-kernel/index.js';

/**
 * Convierte el Result de un caso de uso en el valor o en un AppError lanzado: el manejador de errores global lo traduce
 * a la forma única de error, así ningún controlador repite el mapeo.
 */
export function unwrap<T>(result: Result<T, AppError>): T {
  if (!result.ok) throw result.error;
  return result.value;
}
