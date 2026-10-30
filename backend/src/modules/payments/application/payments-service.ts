import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { detectProofMime } from '../../../platform/storage/file-signature.js';
import type { FileStoragePort } from '../../../platform/storage/local-disk-storage.js';
import { AppError, err, ok } from '../../../shared-kernel/index.js';
import type { Result } from '../../../shared-kernel/index.js';

export interface ProofRecord {
  storageKey: string;
  mimeType: string;
  originalFileName: string;
  sizeBytes: number;
}

export interface RegisterProofInput {
  userId: number;
  idPayment: number;
  originalFileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  referenceNumber: string;
  depositDate: string;
  depositedAmount: string;
}

type PaymentRow = Record<string, unknown>;

/** Puerto de datos que necesita el caso de uso del comprobante. */
export interface PaymentsRepositoryPort {
  paymentsOfOrder(actor: number, asStaff: boolean, idOrder: number): Promise<PaymentRow[]>;
  registerProof(input: RegisterProofInput): Promise<number>;
  getProof(
    actor: number,
    asStaff: boolean,
    idPayment: number,
    idProof: number,
  ): Promise<ProofRecord>;
}

export interface UploadedProof {
  buffer: Buffer;
  originalName: string;
}

export interface ProofDownload {
  stream: Readable;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

const MAX_NAME = 255;

/** Quita todo lo que no sea seguro en una cabecera Content-Disposition; el nombre original solo se guarda, no se confía. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'proof';
  const cleaned = base
    .replace(/[^\w.\- ]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, MAX_NAME);
  return cleaned === '' ? 'proof' : cleaned;
}

/**
 * Casos de uso del comprobante de depósito. El archivo se valida por sus bytes, se guarda con un nombre opaco fuera de la
 * base de datos y, si el registro falla, se borra: no queda un archivo suelto sin pago que lo respalde.
 */
export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepositoryPort,
    private readonly storage: FileStoragePort,
  ) {}

  async uploadProof(input: {
    userId: number;
    idOrder: number;
    file: UploadedProof;
    referenceNumber: string;
    depositDate: string;
    depositedAmount: string;
  }): Promise<Result<{ idPaymentProof: number; idPayment: number }, AppError>> {
    const mimeType = detectProofMime(input.file.buffer);
    if (mimeType === null) {
      return err(
        new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'The file must be a JPEG, a PNG or a PDF'),
      );
    }

    // El comprobante va al intento abierto del pedido; la propiedad se comprueba dentro del procedimiento (otro cliente: 404)
    const payments = await this.repository.paymentsOfOrder(input.userId, false, input.idOrder);
    const open = payments.find(
      (payment) => payment['idPaymentStatus'] === 1 && payment['idPaymentMethod'] === 2,
    );
    if (open === undefined) {
      return err(
        new AppError(422, 'NO_PENDING_DEPOSIT', 'The order has no deposit waiting for a proof'),
      );
    }
    const idPayment = open['idPayment'] as number;

    const storageKey = randomUUID();
    await this.storage.save(storageKey, input.file.buffer);
    try {
      const idPaymentProof = await this.repository.registerProof({
        userId: input.userId,
        idPayment,
        originalFileName: safeFileName(input.file.originalName),
        storageKey,
        mimeType,
        sizeBytes: input.file.buffer.length,
        sha256: createHash('sha256').update(input.file.buffer).digest('hex'),
        referenceNumber: input.referenceNumber,
        depositDate: input.depositDate,
        depositedAmount: input.depositedAmount,
      });
      return ok({ idPaymentProof, idPayment });
    } catch (error) {
      // Compensación: sin pago que lo respalde el archivo sobra
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async download(
    actor: number,
    asStaff: boolean,
    idPayment: number,
    idProof: number,
  ): Promise<ProofDownload> {
    const proof = await this.repository.getProof(actor, asStaff, idPayment, idProof);
    return {
      stream: this.storage.open(proof.storageKey),
      mimeType: proof.mimeType,
      fileName: safeFileName(proof.originalFileName),
      sizeBytes: proof.sizeBytes,
    };
  }
}
