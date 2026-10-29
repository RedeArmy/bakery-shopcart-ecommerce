import { describe, expect, it } from 'vitest';
import { SIMULATOR_STAGE } from '../src/index.js';

describe('recurrente simulator workspace', () => {
  it('is wired into the monorepo; the real tests arrive with Stage 8', () => {
    expect(SIMULATOR_STAGE).toBe(8);
  });
});
