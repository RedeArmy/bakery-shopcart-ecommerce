import type { Page, Row } from '../../../platform/http/serialise.js';
import type { PaymentsRepositoryPort } from './payments-service.js';

export interface DepositSearch {
  statusId: number;
  from: Date | null;
  to: Date | null;
  page: number;
  size: number;
}

export interface BankAccountInput {
  bankName: string;
  accountType: 'Checking' | 'Savings';
  accountNumber: string;
  holderName: string;
  instructions: string | null;
  isActive: boolean;
}

/** Puerto de datos completo de los pagos por depósito, las cuentas bancarias y los reembolsos. */
export interface PaymentsRepository extends PaymentsRepositoryPort {
  createAttempt(
    userId: number,
    idOrder: number,
    storedKey: string,
    idBankAccount: number | null,
  ): Promise<{ idPayment: number; expiresAt: string }>;
  listDeposits(search: DepositSearch): Promise<Page<Row>>;
  /** Resultados esperados en el texto devuelto (Approved, AlreadyApproved, Orphan, RejectedAmountMismatch); el 422 es para lo inválido. */
  approve(actor: number, idPayment: number): Promise<string>;
  /** Rejected, RejectedOrderCancelled (se agotaron los intentos) o AlreadyRejected. */
  reject(actor: number, idPayment: number, reason: string): Promise<string>;
  listBankAccounts(includeInactive: boolean): Promise<Row[]>;
  saveBankAccount(
    actor: number,
    idBankAccount: number | null,
    input: BankAccountInput,
  ): Promise<number>;
  listRefunds(status: string | null, limit: number): Promise<Row[]>;
  markRefund(
    actor: number,
    idRefund: number,
    status: 'Processed' | 'Failed',
    externalReference: string | null,
  ): Promise<void>;
}
