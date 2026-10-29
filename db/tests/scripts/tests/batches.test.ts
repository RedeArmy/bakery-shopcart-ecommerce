import { describe, expect, it } from 'vitest';
import { splitBatches } from '../lib/batches.js';

describe('splitBatches', () => {
  it('splits on lines that only contain GO', () => {
    expect(splitBatches('SELECT 1;\nGO\nSELECT 2;\nGO\n')).toEqual(['SELECT 1;', 'SELECT 2;']);
  });

  it('accepts CRLF, lower case and surrounding spaces', () => {
    expect(splitBatches('SELECT 1;\r\n  go  \r\nSELECT 2;')).toEqual(['SELECT 1;', 'SELECT 2;']);
  });

  it('does not split on GO inside another word or statement', () => {
    const script = "SELECT 1 AS GOAL;\nSELECT N'GO';";
    expect(splitBatches(script)).toEqual([script]);
  });

  it('drops empty batches', () => {
    expect(splitBatches('GO\n\nGO\nSELECT 1;\nGO')).toEqual(['SELECT 1;']);
  });
});
