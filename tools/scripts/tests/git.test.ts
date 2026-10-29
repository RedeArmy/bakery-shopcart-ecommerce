import { describe, expect, it } from 'vitest';
import { resolveGit } from '../lib/git.js';

describe('git resolution', () => {
  it('returns the first fixed location that exists', () => {
    const present = new Set(['/usr/local/bin/git', String.raw`C:\Program Files\Git\cmd\git.exe`]);
    expect(resolveGit((path) => present.has(path))).toBe('/usr/local/bin/git');
  });

  it('never consults the PATH variable', () => {
    const original = process.env['PATH'];
    process.env['PATH'] = '/tmp/writable-by-anyone';
    try {
      expect(resolveGit((path) => path === '/usr/bin/git')).toBe('/usr/bin/git');
    } finally {
      process.env['PATH'] = original;
    }
  });

  it('fails with a clear message when git is not installed in a fixed location', () => {
    expect(() => resolveGit(() => false)).toThrow(/git was not found in any fixed location/);
  });
});
