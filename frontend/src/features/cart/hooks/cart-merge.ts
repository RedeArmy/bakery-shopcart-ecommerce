import type { QueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { clearGuestToken, peekGuestToken } from '../model/guest-token';

let inFlight: Promise<void> | null = null;

/**
 * Entrega el carrito del visitante (el del token) a la cuenta con sesión, sea de invitado o registrada, y olvida el token.
 * Varias llamadas a la vez comparten la misma petición, y nunca falla hacia afuera: si la fusión no se pudo hacer, el
 * token se conserva para el siguiente intento y el cliente puede seguir comprando.
 */
export function mergeVisitorCart(queryClient: QueryClient): Promise<void> {
  const token = peekGuestToken();
  if (token === null) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      unwrap(await api.POST('/api/v1/cart/merge', { body: { guestToken: token } }));
      clearGuestToken();
      // El carrito de la cuenta cambió: se descarta lo que había en memoria para que se pida de nuevo
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    } catch {
      // Se reintenta en el próximo inicio de sesión
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
