import { describe, expect, it } from 'vitest';
import {
  OPTION_CLAUSES,
  describePending,
  pendingOptions,
  type DatabaseOptions,
  type DatabaseOptionName,
} from '../src/options.js';

const ready: DatabaseOptions = {
  readCommittedSnapshot: true,
  queryStore: true,
  pageVerify: 'CHECKSUM',
};

describe('pendingOptions', () => {
  it('has nothing to apply on a database that is already configured', () => {
    expect(pendingOptions(ready)).toEqual([]);
  });

  it('asks for the snapshot read isolation on a database created with the defaults', () => {
    expect(pendingOptions({ ...ready, readCommittedSnapshot: false })).toEqual([
      'READ_COMMITTED_SNAPSHOT',
    ]);
  });

  it('asks for the Query Store when it is off', () => {
    expect(pendingOptions({ ...ready, queryStore: false })).toEqual(['QUERY_STORE']);
  });

  // TORN_PAGE_DETECTION y NONE no detectan todas las páginas dañadas
  it.each(['NONE', 'TORN_PAGE_DETECTION'])(
    'asks for the checksum when page verification is %s',
    (pageVerify) => {
      expect(pendingOptions({ ...ready, pageVerify })).toEqual(['PAGE_VERIFY']);
    },
  );

  it('compares the page verification without regard to case', () => {
    expect(pendingOptions({ ...ready, pageVerify: 'checksum' })).toEqual([]);
  });

  it('lists everything that is missing, snapshot isolation first', () => {
    expect(
      pendingOptions({ readCommittedSnapshot: false, queryStore: false, pageVerify: 'NONE' }),
    ).toEqual(['READ_COMMITTED_SNAPSHOT', 'QUERY_STORE', 'PAGE_VERIFY']);
  });
});

describe('OPTION_CLAUSES', () => {
  const names: DatabaseOptionName[] = ['READ_COMMITTED_SNAPSHOT', 'QUERY_STORE', 'PAGE_VERIFY'];

  it('has a clause for every option', () => {
    expect(Object.keys(OPTION_CLAUSES).sort()).toEqual([...names].sort());
  });

  // Las cláusulas se incrustan en ALTER DATABASE sin parámetros: son constantes y no pueden llevar comillas ni punto y coma
  it.each(names)('%s is a constant clause that cannot break out of the statement', (name) => {
    expect(OPTION_CLAUSES[name]).toMatch(/^SET [A-Z0-9_ =(),]+$/);
    expect(OPTION_CLAUSES[name]).not.toMatch(/['";]/);
  });

  it('waits for the other sessions before enabling the snapshot isolation instead of failing against a running backend', () => {
    expect(OPTION_CLAUSES.READ_COMMITTED_SNAPSHOT).toContain('ROLLBACK AFTER 30 SECONDS');
  });
});

describe('describePending', () => {
  it('names the database and the option and says how to fix it', () => {
    expect(describePending('READ_COMMITTED_SNAPSHOT', 'ShopCart')).toBe(
      'ShopCart does not have READ_COMMITTED_SNAPSHOT on; run npm run db:migrate to apply it.',
    );
  });
});
