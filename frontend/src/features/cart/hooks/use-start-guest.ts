import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '../../../shared/auth';
import { mergeVisitorCart } from './cart-merge';

/**
 * Abre la sesión de invitado de quien todavía no tiene ninguna (para usar un cupón o pagar sin registrarse) y le entrega el
 * carrito que ya había armado como visitante. Al terminar, la sesión y el carrito están listos para la siguiente llamada.
 */
export function useStartGuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await auth.startGuest();
      await mergeVisitorCart(queryClient);
    },
  });
}
