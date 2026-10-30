import type { Row } from '../../../platform/http/serialise.js';

/** Quién es dueño del carrito: una cuenta o un visitante con su token (nunca ambos). */
export type CartIdentity = { userId: number } | { guestToken: string };

/** Puerto de datos del carrito; los totales y el descuento los calcula la base de datos, nunca el backend. */
export interface CartRepository {
  get(identity: CartIdentity): Promise<Row>;
  setItem(
    identity: CartIdentity,
    idVariant: number,
    quantity: number,
    inscription: string | null,
  ): Promise<void>;
  removeItem(identity: CartIdentity, idVariant: number): Promise<void>;
  applyCoupon(idUser: number, code: string): Promise<void>;
  removeCoupon(idUser: number): Promise<void>;
  mergeGuest(idUser: number, guestToken: string): Promise<void>;
}
