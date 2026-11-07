import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api, unwrap } from '../../../shared/api';
import { isGuestSession, useSession } from '../../../shared/auth';
import { peekGuestToken } from '../model/guest-token';
import type { CartLine } from '../model/cart-model';
import { mergeVisitorCart } from './cart-merge';
import { useCart } from './use-cart';

interface CarriedLine {
  idVariant: number;
  quantity: number;
}

/**
 * Mantiene el carrito coherente con la sesión:
 * - al iniciar sesión (o recuperarla) entrega el carrito del visitante a la cuenta (`POST /cart/merge`);
 * - si quien tenía una sesión de invitado inicia sesión o crea una cuenta, pasa sus productos a la cuenta nueva (el
 *   invitado no hereda su carrito: es otra cuenta), sin la personalización ni el cupón;
 * - al cerrar sesión borra el carrito de la cuenta de la memoria para que el siguiente visitante no lo vea.
 */
export function useCartSync(): void {
  const session = useSession();
  const queryClient = useQueryClient();
  const cart = useCart();
  const guestLines = useRef<{ idUser: number; lines: CarriedLine[] } | null>(null);
  const carrying = useRef(false);

  const idUser = session.user?.idUser ?? null;
  const guest = isGuestSession(session);
  const lines: readonly CartLine[] | undefined = cart.data?.lines;

  // Mientras la sesión es de invitado se recuerdan sus productos, para pasarlos si después crea una cuenta
  useEffect(() => {
    if (guest && idUser !== null && lines !== undefined) {
      guestLines.current = {
        idUser,
        lines: lines.map((line) => ({ idVariant: line.idVariant, quantity: line.quantity })),
      };
    }
  }, [guest, idUser, lines]);

  useEffect(() => {
    if (session.status === 'anonymous') {
      guestLines.current = null;
      queryClient.removeQueries({ queryKey: ['cart', 'user'] });
      return;
    }
    if (session.status !== 'authenticated') return;

    if (peekGuestToken() !== null) void mergeVisitorCart(queryClient);

    // Una cuenta registrada que llega desde una sesión de invitado recibe los productos de ese invitado
    const previous = guestLines.current;
    if (!guest && previous !== null && previous.idUser !== idUser && !carrying.current) {
      guestLines.current = null;
      if (previous.lines.length === 0) return;
      carrying.current = true;
      void (async () => {
        try {
          // Lo que ya no alcanza o se agotó se omite: pasar el carrito no debe impedir iniciar sesión
          await Promise.allSettled(
            previous.lines.map(async (line) =>
              unwrap(
                await api.PUT('/api/v1/cart/items/{variantId}', {
                  params: { path: { variantId: line.idVariant }, header: {} },
                  body: { quantity: line.quantity, inscription: null },
                }),
              ),
            ),
          );
          await queryClient.invalidateQueries({ queryKey: ['cart'] });
        } finally {
          carrying.current = false;
        }
      })();
    }
  }, [session.status, idUser, guest, queryClient]);
}
