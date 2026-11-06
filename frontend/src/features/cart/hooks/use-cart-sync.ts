import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { clearGuestToken, peekGuestToken } from '../model/guest-token';
import { cartKey } from './use-cart';

/**
 * Mantiene el carrito coherente con la sesión. Al iniciar sesión (o al recuperarla) entrega el carrito del visitante a la
 * cuenta (`POST /cart/merge`) y descarta el token; al cerrar sesión borra el carrito de la cuenta de la memoria para que
 * el siguiente visitante de este navegador no lo vea.
 */
export function useCartSync(): void {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const merging = useRef(false);

  useEffect(() => {
    if (status === 'anonymous') {
      queryClient.removeQueries({ queryKey: cartKey('user') });
      return;
    }
    const token = peekGuestToken();
    if (status !== 'authenticated' || token === null || merging.current) return;

    merging.current = true;
    void (async () => {
      try {
        const cart = unwrap(await api.POST('/api/v1/cart/merge', { body: { guestToken: token } }));
        clearGuestToken();
        queryClient.setQueryData(cartKey('user'), cart);
        queryClient.removeQueries({ queryKey: cartKey('guest') });
      } catch {
        // La fusión nunca debe impedir comprar: el token se conserva y se reintenta en el próximo inicio de sesión
      } finally {
        merging.current = false;
      }
    })();
  }, [status, queryClient]);
}
