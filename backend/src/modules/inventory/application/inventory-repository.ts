import type { Page, Row } from '../../../platform/http/serialise.js';

/** Puerto de datos del libro de inventario: el stock solo entra y sale por procedimientos, nunca por UPDATE directo. */
export interface InventoryRepository {
  ledger(
    idVariant: number,
    range: { from: Date | null; to: Date | null },
    page: number,
    size: number,
  ): Promise<Page<Row>>;
  registerEntry(
    actor: number,
    idVariant: number,
    quantity: number,
    reason: string,
  ): Promise<string>;
  /** Devuelve null cuando el stock ya era el pedido y no hubo movimiento que registrar. */
  adjust(
    actor: number,
    idVariant: number,
    newOnHand: number,
    reason: string,
  ): Promise<string | null>;
}
