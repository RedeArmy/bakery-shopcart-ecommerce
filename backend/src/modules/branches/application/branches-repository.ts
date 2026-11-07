import type { Row } from '../../../platform/http/serialise.js';

export interface BranchInput {
  name: string;
  line1: string;
  municipality: string;
  department: string;
  phone: string | null;
  openingHours: string | null;
}

/** Puerto de datos de las sucursales; el adaptador SQL llama a SP_Branches_*. */
export interface BranchesRepository {
  list(includeInactive: boolean): Promise<Row[]>;
  create(actor: number, input: BranchInput): Promise<number>;
  update(actor: number, id: number, input: BranchInput): Promise<void>;
  deactivate(actor: number, id: number): Promise<void>;
}
