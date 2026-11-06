import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { useSession } from '../../../shared/auth';
import { EMPTY_CART } from '../model/cart-model';
import type { Cart } from '../model/cart-model';
import { getGuestToken, peekGuestToken } from '../model/guest-token';

export type CartMode = 'user' | 'guest';

/** De quién es el carrito: de la cuenta con sesión o del visitante. `ready` es falso mientras se recupera la sesión. */
export function useCartMode(): { ready: boolean; mode: CartMode } {
  const session = useSession();
  return {
    ready: session.status !== 'unknown',
    mode: session.status === 'authenticated' ? 'user' : 'guest',
  };
}

export const cartKey = (mode: CartMode) => ['cart', mode] as const;

// El visitante manda su token; quien tiene sesión no manda ninguno (el servidor lo identifica por el access token)
const guestHeader = (mode: CartMode) =>
  mode === 'guest' ? { 'X-Cart-Token': getGuestToken() } : {};

/** El carrito actual. Un visitante sin token no tiene carrito: no se le pregunta al servidor. */
export function useCart() {
  const { ready, mode } = useCartMode();
  return useQuery({
    queryKey: cartKey(mode),
    enabled: ready,
    queryFn: async ({ signal }): Promise<Cart> => {
      const token = peekGuestToken();
      if (mode === 'guest' && token === null) return EMPTY_CART;
      return unwrap(
        await api.GET('/api/v1/cart', {
          params: { header: mode === 'guest' && token !== null ? { 'X-Cart-Token': token } : {} },
          signal,
        }),
      );
    },
  });
}

/** Las operaciones del carrito devuelven el carrito completo: se guarda tal cual, sin pedirlo otra vez. */
function useCartMutation<TVariables>(
  run: (variables: TVariables, mode: CartMode) => Promise<Cart>,
) {
  const queryClient = useQueryClient();
  const { mode } = useCartMode();
  return useMutation({
    mutationFn: (variables: TVariables) => run(variables, mode),
    onSuccess: (cart) => {
      queryClient.setQueryData(cartKey(mode), cart);
    },
  });
}

export interface SetItemInput {
  idVariant: number;
  quantity: number;
  inscription?: string | null;
}

export const useSetCartItem = () =>
  useCartMutation(async ({ idVariant, quantity, inscription }: SetItemInput, mode) =>
    unwrap(
      await api.PUT('/api/v1/cart/items/{variantId}', {
        params: { path: { variantId: idVariant }, header: guestHeader(mode) },
        body: { quantity, inscription: inscription ?? null },
      }),
    ),
  );

export const useRemoveCartItem = () =>
  useCartMutation(async (idVariant: number, mode) =>
    unwrap(
      await api.DELETE('/api/v1/cart/items/{variantId}', {
        params: { path: { variantId: idVariant }, header: guestHeader(mode) },
      }),
    ),
  );

// El cupón solo existe para cuentas con sesión; la clave de idempotencia evita aplicarlo dos veces si se repite el envío
export const useApplyCoupon = () =>
  useCartMutation(async (code: string) =>
    unwrap(
      await api.POST('/api/v1/cart/coupon', {
        params: { header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: { code },
      }),
    ),
  );

export const useRemoveCoupon = () =>
  useCartMutation(async () => unwrap(await api.DELETE('/api/v1/cart/coupon', {})));
