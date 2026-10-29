import { describe, expect, it } from 'vitest';
import { RUNNER_STAGE } from '../src/index.js';

describe('db runner workspace', () => {
  it('is wired into the monorepo; the real tests arrive with Stage 2', () => {
    expect(RUNNER_STAGE).toBe(2);
  });
});
