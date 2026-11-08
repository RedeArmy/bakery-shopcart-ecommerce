import type { Row } from '../../../platform/http/serialise.js';

export type ManagedMethodKind = 'Deposit' | 'Cash';

export interface PaymentMethodInput {
  title: string;
  description: string | null;
  appliesToDelivery: boolean;
  appliesToPickup: boolean;
}

/** Puerto de datos de los métodos de pago; el adaptador SQL llama a SP_PaymentMethods_*. */
export interface PaymentMethodsRepository {
  /** Los que administra el administrador (todos menos la tarjeta), con los desactivados */
  list(): Promise<Row[]>;
  create(actor: number, kind: ManagedMethodKind, input: PaymentMethodInput): Promise<number>;
  /** `isActive` nulo deja el estado como está; con `true` reactiva un método desactivado */
  update(
    actor: number,
    id: number,
    input: PaymentMethodInput,
    isActive: boolean | null,
  ): Promise<void>;
  deactivate(actor: number, id: number): Promise<void>;
}
