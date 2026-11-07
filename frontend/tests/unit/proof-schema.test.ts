import { describe, expect, it } from 'vitest';
import {
  MAX_PROOF_BYTES,
  proofFileProblem,
  proofSchema,
} from '../../src/features/payments/model/schemas';

const file = (type: string, size: number): File => {
  const made = new File(['x'], 'proof', { type });
  Object.defineProperty(made, 'size', { value: size });
  return made;
};

describe('proofFileProblem', () => {
  it('asks for a file', () => {
    expect(proofFileProblem(null)).toBe('payment.proof.validation.fileRequired');
  });

  it('accepts JPEG, PNG and PDF', () => {
    for (const type of ['image/jpeg', 'image/png', 'application/pdf']) {
      expect(proofFileProblem(file(type, 1000))).toBeNull();
    }
  });

  it('rejects other types and files over 5 MB', () => {
    expect(proofFileProblem(file('image/gif', 1000))).toBe('payment.proof.validation.fileType');
    expect(proofFileProblem(file('image/png', MAX_PROOF_BYTES + 1))).toBe(
      'payment.proof.validation.fileTooBig',
    );
    expect(proofFileProblem(file('image/png', MAX_PROOF_BYTES))).toBeNull();
  });
});

describe('proofSchema', () => {
  const valid = { referenceNumber: '123456', depositDate: '2030-06-10', depositedAmount: '145.00' };

  it('accepts a complete proof', () => {
    expect(proofSchema.safeParse(valid).success).toBe(true);
  });

  it('keeps the amount as text with two decimals', () => {
    expect(proofSchema.safeParse({ ...valid, depositedAmount: '145' }).success).toBe(false);
    expect(proofSchema.safeParse({ ...valid, depositedAmount: '145.5' }).success).toBe(false);
    expect(proofSchema.safeParse({ ...valid, depositedAmount: '1,45.00' }).success).toBe(false);
  });

  it('requires the reference and a date', () => {
    expect(proofSchema.safeParse({ ...valid, referenceNumber: '  ' }).success).toBe(false);
    expect(proofSchema.safeParse({ ...valid, depositDate: '' }).success).toBe(false);
  });
});
