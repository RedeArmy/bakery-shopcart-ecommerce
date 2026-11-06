import { describe, expect, it } from 'vitest';
import {
  countIntegrationFlows,
  countOperations,
  countPostman,
  countTsqltTests,
} from '../lib/figures.js';

describe('counting sources that have nothing to count', () => {
  it('answers zero, not an error, when a source has no match at all', () => {
    expect(countTsqltTests('SELECT 1;')).toBe(0);
    expect(countOperations('openapi: 3.0.3')).toBe(0);
    expect(countIntegrationFlows('const x = 1;')).toBe(0);
  });

  it('skips entries that are neither a folder nor a request, and requests without events', () => {
    const collection = {
      item: [
        { name: 'a note that is not a request' },
        { request: {} },
        { request: {}, event: [{ listen: 'test', script: { exec: ['pm.test("one", f);'] } }] },
      ],
    };
    expect(countPostman(collection)).toEqual({ requests: 2, assertions: 1 });
  });

  it('counts an empty collection as nothing', () => {
    expect(countPostman({ item: [] })).toEqual({ requests: 0, assertions: 0 });
  });
});
