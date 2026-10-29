import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseChecksums, verifyDirectory } from '../lib/checksums.js';

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'checksums-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const writeVendored = (name: string, content: string): void => {
  writeFileSync(join(directory, name), content);
};

const writeList = (...lines: string[]): void => {
  writeFileSync(join(directory, 'SHA256SUMS'), `${lines.join('\n')}\n`);
};

describe('parseChecksums', () => {
  it('reads the sha256sum format in binary and text mode', () => {
    const hash = sha256('a');
    const { entries, malformed } = parseChecksums(`${hash} *one.sql\n${hash}  two.sql\n\n`);
    expect(entries).toEqual([
      { hash, name: 'one.sql' },
      { hash, name: 'two.sql' },
    ]);
    expect(malformed).toEqual([]);
  });

  it('reports lines that are not a valid checksum', () => {
    expect(parseChecksums('not a checksum\n').malformed).toEqual(['not a checksum']);
  });
});

describe('verifyDirectory', () => {
  it('accepts files that match their checksums, ignoring the documentation', () => {
    writeVendored('framework.sql', 'CREATE SCHEMA x;\r\n');
    writeVendored('README.md', '# docs');
    writeList(`${sha256('CREATE SCHEMA x;\r\n')} *framework.sql`);
    expect(verifyDirectory(directory)).toEqual([]);
  });

  it('detects a file that was modified, even by a single line ending', () => {
    writeVendored('framework.sql', 'CREATE SCHEMA x;\n');
    writeList(`${sha256('CREATE SCHEMA x;\r\n')} *framework.sql`);
    const problems = verifyDirectory(directory);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('does not match its checksum');
  });

  it('detects a listed file that is missing', () => {
    writeList(`${sha256('x')} *gone.sql`);
    expect(verifyDirectory(directory)[0]).toContain('is listed but missing');
  });

  it('detects a file that has no checksum', () => {
    writeVendored('smuggled.sql', 'DROP DATABASE x;');
    writeList(`${sha256('y')} *other.sql`);
    expect(verifyDirectory(directory).some((p) => p.includes('smuggled.sql is not listed'))).toBe(
      true,
    );
  });

  it('detects a malformed line and a missing checksum list', () => {
    writeList('garbage');
    expect(verifyDirectory(directory)[0]).toContain('malformed line');
    rmSync(join(directory, 'SHA256SUMS'));
    expect(verifyDirectory(directory)).toEqual([`${join(directory, 'SHA256SUMS')} is missing`]);
  });
});
