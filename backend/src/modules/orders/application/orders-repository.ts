import type { Page, Row } from '../../../platform/http/serialise.js';

export interface OrderFilter {
  /** Quien pregunta, siempre del token */
  actor: number;
  asStaff: boolean;
  statusId: number | null;
  search: string | null;
  from: Date | null;
  to: Date | null;
  page: number;
  size: number;
}

export interface ReturnLineInput {
  idOrderLine: number;
  quantity: number;
}

/** Puerto de datos de los pedidos: la pertenencia se comprueba dentro de cada procedimiento con el actor del token. */
export interface OrdersRepository {
  list(filter: OrderFilter): Promise<Page<Row>>;
  detail(actor: number, asStaff: boolean, idOrder: number): Promise<Row>;
  cancel(actor: number, idOrder: number, reason: string): Promise<void>;
  changeStatus(
    actor: number,
    idOrder: number,
    status: number,
    comment: string | null,
  ): Promise<void>;
  registerReturn(
    actor: number,
    idOrder: number,
    reason: string,
    lines: readonly ReturnLineInput[],
  ): Promise<{ idReturn: number; idRefund: number; refundAmount: string }>;
}
