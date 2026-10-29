// cspell:ignore Introducción Arquitectura Español
import { describe, expect, it } from 'vitest';
import { compareReadmes } from '../lib/readme-sync.js';

const spanish = [
  '[English](README.en.md)',
  '## 1. Introducción',
  '```bash',
  'npm run up',
  '```',
  '## 2. Arquitectura',
].join('\n');

const english = [
  '[Español](README.md)',
  '## 1. Introduction',
  '```bash',
  'npm run up',
  '```',
  '## 2. Architecture',
].join('\n');

describe('README synchronisation', () => {
  it('accepts two READMEs with the same structure', () => {
    expect(compareReadmes(spanish, english)).toEqual([]);
  });

  it('detects a missing section', () => {
    const problems = compareReadmes(spanish, english.replace('## 2. Architecture', ''));
    expect(problems.some((p) => p.includes('headings differ'))).toBe(true);
  });

  it('detects a command that differs', () => {
    const problems = compareReadmes(spanish, english.replace('npm run up', 'npm run down'));
    expect(problems.some((p) => p.includes('differs between'))).toBe(true);
  });

  it('requires the reciprocal links', () => {
    expect(compareReadmes('## 1. A', '## 1. A').length).toBeGreaterThanOrEqual(2);
  });
});
