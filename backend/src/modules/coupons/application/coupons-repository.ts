import type { Page, Row } from '../../../platform/http/serialise.js';

export interface CouponInput {
  type: 'Percentage' | 'FixedAmount';
  value: string;
  minimumAmount: string;
  startsAt: Date;
  endsAt: Date;
  totalUsageLimit: number | null;
  perCustomerUsageLimit: number | null;
  categoryId: number | null;
}

/** Qué cupones se listan: todos, solo los vigentes ahora o solo los desactivados. */
export type CouponStatusFilter = 'All' | 'Active' | 'Inactive' | 'Expired';

/** Puerto de datos de los cupones: la vigencia, los límites y el descuento los decide la base de datos. */
export interface CouponsRepository {
  list(
    includeInactive: boolean,
    status: CouponStatusFilter | null,
    page: number,
    size: number,
  ): Promise<Page<Row>>;
  create(actor: number, code: string, input: CouponInput): Promise<number>;
  update(actor: number, id: number, input: CouponInput): Promise<void>;
  deactivate(actor: number, id: number): Promise<void>;
  /** Vuelve a activar un cupón desactivado. */
  reactivate(actor: number, id: number): Promise<void>;
  /** Borra por completo un cupón desactivado que ningún pedido usó; la base de datos lo exige. */
  delete(actor: number, id: number): Promise<void>;
}
