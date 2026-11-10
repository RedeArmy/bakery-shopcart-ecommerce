// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  apiStatus,
  parseRefundFilter,
  referenceSchema,
  refundParams,
} from '../../src/features/refunds/model/refunds';

const parse = (search: string) => parseRefundFilter(new URLSearchParams(search));

describe('the refunds filter', () => {
  it('starts with the ones that wait', () => {
    expect(parse('')).toBe('Pending');
  });

  it('reads the state from the address', () => {
    expect(parse('status=Failed')).toBe('Failed');
    expect(parse('status=Processed')).toBe('Processed');
    expect(parse('status=all')).toBe('all');
  });

  it('falls back to the ones that wait for what it does not understand', () => {
    expect(parse('status=Done')).toBe('Pending');
    expect(parse('status=pending')).toBe('Pending');
  });

  it('writes only what differs from the default', () => {
    expect(refundParams('Pending').toString()).toBe('');
    expect(refundParams('all').toString()).toBe('status=all');
    expect(refundParams('Processed').toString()).toBe('status=Processed');
  });

  it('asks the server for a state, except for «all»', () => {
    expect(apiStatus('Failed')).toBe('Failed');
    expect(apiStatus('all')).toBeUndefined();
  });
});

describe('the reference of the transfer', () => {
  it('is required and trimmed', () => {
    expect(referenceSchema.safeParse({ reference: '  TRF-2030-0001  ' })).toMatchObject({
      success: true,
      data: { reference: 'TRF-2030-0001' },
    });
    expect(referenceSchema.safeParse({ reference: '   ' }).success).toBe(false);
  });

  it('has the length that the database allows', () => {
    expect(referenceSchema.safeParse({ reference: 'a'.repeat(80) }).success).toBe(true);
    expect(referenceSchema.safeParse({ reference: 'a'.repeat(81) }).success).toBe(false);
  });
});
