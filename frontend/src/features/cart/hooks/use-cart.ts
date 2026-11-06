import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '../../../shared/api';
import { auth, useSession } from '../../../shared/auth';
import type { SessionState } from '../../../shared/auth';
import { EMPTY_CART } from '../model/cart-model';
import type { Cart } from '../model/cart-model';
import { getGuestToken, peekGuestToken } from '../model/guest-token';

export type CartMode = 'user' | 'guest';

interface CartOwner {
  /** Falso mientras se recupera la sesión: hasta entonces no se sabe de quién es el carrito */
  ready: boolean;
  /** `user` con sesión (una cuenta registrada o de invitado), `guest` para el visitante con token */
  mode: CartMode;
  /** La cuenta dueña del carrito; distingue el de un invitado del de la cuenta que se crea después */
  idUser: number | null;
}

const ownerOf = (session: SessionState): CartOwner => ({
  ready: session.status !== 'unknown',
  mode: session.status === 'authenticated' ? 'user' : 'guest',
  idUser: session.user?.idUser ?? null,
});

/** De quién es el carrito. */
export function useCartOwner(): CartOwner {
  return ownerOf(useSession());
}

/** La clave incluye la cuenta: al pasar de invitado a una cuenta registrada no se ve el carrito del invitado. */
export const cartKey = (owner: Pick<CartOwner, 'mode' | 'idUser'>) =>
  ['cart', owner.mode, owner.idUser] as const;

// El visitante manda su token; quien tiene sesión no manda ninguno (el servidor lo identifica por el access token)
const guestHeader = (mode: CartMode) =>
  mode === 'guest' ? { 'X-Cart-Token': getGuestToken() } : {};

/** El carrito actual. Un visitante sin token no tiene carrito: no se le pregunta al servidor. */
export function useCart() {
  const owner = useCartOwner();
  return useQuery<Cart>({
    queryKey: cartKey(owner),
    enabled: owner.ready,
    // Al abrir la sesión de invitado el carrito del visitante pasa a esa cuenta: es el mismo carrito, así que mientras llega
    // se sigue mostrando y la pantalla no se desmonta a medias de una operación (por ejemplo, aplicar un cupón). Para
    // cualquier otro cambio de dueño no se conserva nada: el carrito de otra cuenta nunca se ve.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === 'guest' ? previous : undefined,
    queryFn: async ({ signal }) => {
      const token = peekGuestToken();
      if (owner.mode === 'guest' && token === null) return EMPTY_CART;
      return unwrap(
        await api.GET('/api/v1/cart', {
          params: {
            header: owner.mode === 'guest' && token !== null ? { 'X-Cart-Token': token } : {},
          },
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
  // El dueño se lee al ejecutar y no al dibujar: un visitante que abre su sesión de invitado justo antes de aplicar un
  // cupón debe guardar el carrito bajo la cuenta nueva
  return useMutation({
    mutationFn: (variables: TVariables) => run(variables, ownerOf(auth.getState()).mode),
    onSuccess: (cart) => {
      queryClient.setQueryData(cartKey(ownerOf(auth.getState())), cart);
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

// Un cupón es de una cuenta (registrada o de invitado); la clave de idempotencia evita aplicarlo dos veces si se repite el envío
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
