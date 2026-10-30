import { describe, expect, it } from 'vitest';
import { findRegisterProblems } from '../lib/migration-register.js';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

const register = [
  '| V0001 | `V0001__first.sql` | First |',
  '### V0001: First',
  '| File | `db/migrations/V0001__first.sql` |',
  `| SHA-256 | \`${hashA}\` |`,
  '| S0001 | `S0001__roles.sql` | `' + hashB + '` | Roles |',
].join('\n');

describe('findRegisterProblems', () => {
  it('accepts files whose entry carries their current checksum', () => {
    expect(
      findRegisterProblems(register, [
        { name: 'V0001__first.sql', checksum: hashA },
        { name: 'S0001__roles.sql', checksum: hashB },
      ]),
    ).toEqual([]);
  });

  it('reports a file with no entry', () => {
    expect(
      findRegisterProblems(register, [{ name: 'V0002__second.sql', checksum: hashA }]),
    ).toEqual(['V0002__second.sql has no entry in the migration register']);
  });

  it('reports an entry whose checksum no longer matches the file', () => {
    const [problem] = findRegisterProblems(register, [
      { name: 'V0001__first.sql', checksum: 'c'.repeat(64) },
    ]);
    expect(problem).toMatch(
      /V0001__first\.sql: the checksum in the migration register does not match/,
    );
  });

  it('does not take the summary table as the entry', () => {
    // El nombre aparece primero en la tabla resumen, sin checksum; la comprobación debe mirar la ficha
    expect(findRegisterProblems(register, [{ name: 'V0001__first.sql', checksum: hashA }])).toEqual(
      [],
    );
  });
});
