import type { Page, Row } from '../../../platform/http/serialise.js';

export interface AuditSearch {
  module: string | null;
  entityKey: string | null;
  from: Date | null;
  to: Date | null;
  page: number;
  size: number;
}

/** Puerto de lectura de la bitácora de auditoría y de las versiones del sistema. */
export interface AuditRepository {
  query(search: AuditSearch): Promise<Page<Row>>;
  systemVersion(): Promise<{ schemaVersion: number; objects: Row[] }>;
  /** Discrepancias actuales de importes e inventario; vacío cuando todo cuadra */
  reconciliation(limit: number): Promise<Row[]>;
}
