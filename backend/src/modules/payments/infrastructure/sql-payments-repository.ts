import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow, toPage } from '../../../platform/http/serialise.js';
import type { Page, Row } from '../../../platform/http/serialise.js';
import type {
  BankAccountInput,
  DepositSearch,
  PaymentsRepository,
} from '../application/payments-repository.js';
import type { PaymentsRepositoryPort, ProofRecord } from '../application/payments-service.js';

/** Adaptador SQL de los pagos por depósito, las cuentas bancarias y los reembolsos. */
export function createSqlPaymentsRepository(execute: ProcedureExecutor): PaymentsRepository {
  const port: PaymentsRepositoryPort = {
    async paymentsOfOrder(actor, asStaff, idOrder) {
      const result = await execute<Row>('dbo.SP_Payments_GetByOrder', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'AsStaff', type: sql.Bit, value: asStaff },
        { name: 'IDOrder', type: sql.Int, value: idOrder },
      ]);
      return result.rows.map((row) => camelRow(row, ['Proofs']));
    },

    async registerProof(input) {
      const result = await execute(
        'dbo.SP_Payments_RegisterProof',
        [
          { name: 'IDUser', type: sql.Int, value: input.userId },
          { name: 'IDPayment', type: sql.Int, value: input.idPayment },
          { name: 'OriginalFileName', type: sql.NVarChar(255), value: input.originalFileName },
          { name: 'StorageKey', type: sql.NVarChar(100), value: input.storageKey },
          { name: 'MimeType', type: sql.NVarChar(50), value: input.mimeType },
          { name: 'SizeBytes', type: sql.Int, value: input.sizeBytes },
          { name: 'Sha256Hash', type: sql.Char(64), value: input.sha256 },
          { name: 'ReferenceNumber', type: sql.NVarChar(40), value: input.referenceNumber },
          {
            name: 'DepositDate',
            type: sql.Date,
            value: new Date(`${input.depositDate}T00:00:00.000Z`),
          },
          { name: 'DepositedAmount', type: sql.Decimal(18, 2), value: input.depositedAmount },
        ],
        [{ name: 'IDPaymentProof', type: sql.Int }],
      );
      return result.output['IDPaymentProof'] as number;
    },

    async getProof(actor, asStaff, idPayment, idProof): Promise<ProofRecord> {
      const result = await execute<{
        StorageKey: string;
        MimeType: string;
        OriginalFileName: string;
        SizeBytes: number;
      }>('dbo.SP_Payments_GetProof', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'AsStaff', type: sql.Bit, value: asStaff },
        { name: 'IDPayment', type: sql.Int, value: idPayment },
        { name: 'IDPaymentProof', type: sql.Int, value: idProof },
      ]);
      const row = result.rows[0];
      if (row === undefined) throw new TypeError('SP_Payments_GetProof returned no row');
      return {
        storageKey: row.StorageKey,
        mimeType: row.MimeType,
        originalFileName: row.OriginalFileName,
        sizeBytes: row.SizeBytes,
      };
    },
  };

  return {
    ...port,

    async createAttempt(
      userId: number,
      idOrder: number,
      storedKey: string,
      idBankAccount: number | null,
    ): Promise<{ idPayment: number; expiresAt: string }> {
      const result = await execute(
        'dbo.SP_Payments_CreateDepositAttempt',
        [
          { name: 'IDUser', type: sql.Int, value: userId },
          { name: 'IDOrder', type: sql.Int, value: idOrder },
          { name: 'IdempotencyKey', type: sql.NVarChar(64), value: storedKey },
          { name: 'IDBankAccount', type: sql.Int, value: idBankAccount },
        ],
        [
          { name: 'IDPayment', type: sql.Int },
          { name: 'ExpiresAt', type: sql.DateTime2(3) },
        ],
      );
      return {
        idPayment: result.output['IDPayment'] as number,
        expiresAt: (result.output['ExpiresAt'] as Date).toISOString(),
      };
    },

    async listDeposits(search: DepositSearch): Promise<Page<Row>> {
      const result = await execute<Row>('dbo.SP_Payments_ListPendingDeposits', [
        { name: 'IDPaymentStatus', type: sql.TinyInt, value: search.statusId },
        { name: 'From', type: sql.DateTime2(3), value: search.from },
        { name: 'To', type: sql.DateTime2(3), value: search.to },
        { name: 'PageNumber', type: sql.Int, value: search.page },
        { name: 'PageSize', type: sql.Int, value: search.size },
      ]);
      return toPage(result.rows, search.page, search.size);
    },

    /** Resultados esperados en `outcome` (Approved, AlreadyApproved, Orphan, RejectedAmountMismatch); el 422 es para lo inválido. */
    async approve(actor: number, idPayment: number): Promise<string> {
      const result = await execute(
        'dbo.SP_Payments_ApproveDeposit',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'IDPayment', type: sql.Int, value: idPayment },
        ],
        [{ name: 'Outcome', type: sql.VarChar(30) }],
      );
      return result.output['Outcome'] as string;
    },

    /** Rejected, RejectedOrderCancelled (se agotaron los intentos) o AlreadyRejected. */
    async reject(actor: number, idPayment: number, reason: string): Promise<string> {
      const result = await execute(
        'dbo.SP_Payments_RejectDeposit',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'IDPayment', type: sql.Int, value: idPayment },
          { name: 'Reason', type: sql.NVarChar(250), value: reason },
        ],
        [{ name: 'Outcome', type: sql.VarChar(30) }],
      );
      return result.output['Outcome'] as string;
    },

    async listBankAccounts(includeInactive: boolean): Promise<Row[]> {
      const result = await execute<Row>('dbo.SP_BankAccounts_List', [
        { name: 'IncludeInactive', type: sql.Bit, value: includeInactive },
      ]);
      return result.rows.map((row) => camelRow(row));
    },

    async saveBankAccount(
      actor: number,
      idBankAccount: number | null,
      input: BankAccountInput,
    ): Promise<number> {
      const result = await execute(
        'dbo.SP_BankAccounts_Save',
        [
          { name: 'IDActor', type: sql.Int, value: actor },
          { name: 'IDBankAccount', type: sql.Int, value: idBankAccount },
          { name: 'BankName', type: sql.NVarChar(80), value: input.bankName },
          { name: 'AccountType', type: sql.NVarChar(12), value: input.accountType },
          { name: 'AccountNumber', type: sql.NVarChar(30), value: input.accountNumber },
          { name: 'HolderName', type: sql.NVarChar(120), value: input.holderName },
          { name: 'Instructions', type: sql.NVarChar(300), value: input.instructions },
          { name: 'IsActive', type: sql.Bit, value: input.isActive },
        ],
        [{ name: 'IDSaved', type: sql.Int }],
      );
      return result.output['IDSaved'] as number;
    },

    async listRefunds(status: string | null, limit: number): Promise<Row[]> {
      const result = await execute<Row>('dbo.SP_Refunds_List', [
        { name: 'Status', type: sql.NVarChar(12), value: status },
        { name: 'Limit', type: sql.Int, value: limit },
      ]);
      return result.rows.map((row) => camelRow(row));
    },

    async markRefund(
      actor: number,
      idRefund: number,
      status: 'Processed' | 'Failed',
      externalReference: string | null,
    ): Promise<void> {
      await execute('dbo.SP_Refunds_Mark', [
        { name: 'IDActor', type: sql.Int, value: actor },
        { name: 'IDRefund', type: sql.Int, value: idRefund },
        { name: 'Status', type: sql.NVarChar(12), value: status },
        { name: 'ExternalReference', type: sql.NVarChar(80), value: externalReference },
      ]);
    },
  };
}
