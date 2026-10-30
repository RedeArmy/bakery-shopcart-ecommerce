import type { Page, Row } from '../../../platform/http/serialise.js';

export interface AddressInput {
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string | null;
  municipality: string;
  department: string;
  reference: string | null;
  isActive: boolean;
}

export interface UserSearch {
  search: string | null;
  roleId: number | null;
  isActive: boolean | null;
  page: number;
  size: number;
}

/** Puerto de datos de direcciones y cuentas; la pertenencia de una dirección se comprueba dentro del procedimiento. */
export interface UsersRepository {
  listAddresses(idUser: number, includeInactive: boolean): Promise<Row[]>;
  /** Sin idAddress crea; con él edita, y solo si la dirección es de la persona (otra responde 404). */
  saveAddress(idUser: number, idAddress: number | null, input: AddressInput): Promise<number>;
  listUsers(search: UserSearch): Promise<Page<Row>>;
  setUserStatus(actor: number, idUser: number, isActive: boolean): Promise<void>;
}
