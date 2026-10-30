import { describe, expect, it } from 'vitest';
import { checksumOf } from '../src/checksum.js';
import { MigrationError } from '../src/errors.js';
import { findProblems, planRun, type DatabaseState } from '../src/plan.js';
import type { ScriptFile, ScriptType } from '../src/scripts.js';

function script(type: ScriptType, number: number, content = 'SELECT 1;'): ScriptFile {
  return {
    type,
    number,
    fileName: `${type}${String(number).padStart(4, '0')}__x.sql`,
    description: 'x',
    content,
    checksum: checksumOf(content),
  };
}

function objectScript(version: string, content: string): ScriptFile {
  return {
    ...script('R', 101, content),
    object: { name: 'dbo.SP_Orders_Create', type: 'P', version, change: 'Change' },
  };
}

function applied(file: ScriptFile): DatabaseState['scripts'][number] {
  return { type: file.type, number: file.number, fileName: file.fileName, checksum: file.checksum };
}

const empty: DatabaseState = { scripts: [], objects: [] };

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof MigrationError ? error.code : 'OTHER';
  }
  return undefined;
}

describe('planRun migrations', () => {
  it('runs every migration on an empty database, in order', () => {
    const scripts = [script('V', 1), script('V', 2)];
    expect(planRun(scripts, empty)).toEqual(scripts);
  });

  it('skips applied migrations and runs only the new one', () => {
    const first = script('V', 1);
    const second = script('V', 2, 'SELECT 2;');
    const state = { ...empty, scripts: [applied(first)] };
    expect(planRun([first, second], state)).toEqual([second]);
  });

  it('rejects an edited migration (drift)', () => {
    const original = script('V', 1);
    const edited = script('V', 1, 'SELECT 99;');
    expect(codeOf(() => planRun([edited], { ...empty, scripts: [applied(original)] }))).toBe(
      'MIGRATION_DRIFT',
    );
  });

  it('rejects an applied migration whose file disappeared', () => {
    const state = { ...empty, scripts: [applied(script('V', 1))] };
    expect(codeOf(() => planRun([], state))).toBe('MIGRATION_MISSING');
  });

  it('rejects a new migration numbered below an applied one', () => {
    const state = { ...empty, scripts: [applied(script('V', 5))] };
    expect(codeOf(() => planRun([script('V', 3), script('V', 5)], state))).toBe(
      'MIGRATION_OUT_OF_ORDER',
    );
  });
});

describe('planRun objects', () => {
  const v1 = objectScript('1.0.0', 'CREATE PROCEDURE a');
  const state: DatabaseState = {
    scripts: [applied(v1)],
    objects: [
      {
        objectName: 'dbo.SP_Orders_Create',
        version: '1.0.0',
        checksum: v1.checksum,
        definitionChecksum: 'd',
      },
    ],
  };

  it('applies a new object', () => {
    expect(planRun([v1], empty)).toEqual([v1]);
  });

  it('skips an unchanged object', () => {
    expect(planRun([v1], state)).toEqual([]);
  });

  it('applies a changed object whose version was raised', () => {
    const v2 = objectScript('1.1.0', 'CREATE PROCEDURE b');
    expect(planRun([v2], state)).toEqual([v2]);
  });

  it('rejects a changed object whose version was not raised', () => {
    expect(codeOf(() => planRun([objectScript('1.0.0', 'CREATE PROCEDURE b')], state))).toBe(
      'OBJECT_VERSION_NOT_RAISED',
    );
  });

  it('rejects a lowered version', () => {
    const current: DatabaseState = {
      ...state,
      objects: [
        {
          objectName: 'dbo.SP_Orders_Create',
          version: '2.0.0',
          checksum: v1.checksum,
          definitionChecksum: 'd',
        },
      ],
    };
    expect(codeOf(() => planRun([objectScript('1.5.0', 'CREATE PROCEDURE b')], current))).toBe(
      'OBJECT_VERSION_LOWERED',
    );
  });
});

describe('planRun seeds', () => {
  it('runs a seed once and again only when it changes', () => {
    const seed = script('S', 1, 'MERGE a');
    expect(planRun([seed], empty)).toEqual([seed]);
    expect(planRun([seed], { ...empty, scripts: [applied(seed)] })).toEqual([]);
    const changed = script('S', 1, 'MERGE b');
    expect(planRun([changed], { ...empty, scripts: [applied(seed)] })).toEqual([changed]);
  });
});

describe('findProblems', () => {
  const file = objectScript('1.0.0', 'CREATE PROCEDURE a');
  const state: DatabaseState = {
    scripts: [applied(file)],
    objects: [
      {
        objectName: 'dbo.SP_Orders_Create',
        version: '1.0.0',
        checksum: file.checksum,
        definitionChecksum: 'abc',
      },
    ],
  };

  it('reports nothing when the database matches', () => {
    expect(findProblems([file], state, new Map([['dbo.SP_Orders_Create', 'abc']]))).toEqual([]);
  });

  it('reports pending scripts', () => {
    expect(
      findProblems([file, script('V', 1)], state, new Map([['dbo.SP_Orders_Create', 'abc']])),
    ).toEqual(['V0001__x.sql is pending']);
  });

  it('reports drift from the planner', () => {
    const [problem] = findProblems(
      [script('V', 1, 'SELECT 9;')],
      {
        ...state,
        scripts: [applied(script('V', 1))],
      },
      new Map([['dbo.SP_Orders_Create', 'abc']]),
    );
    expect(problem).toMatch(/^MIGRATION_DRIFT/);
  });

  it('reports an object whose file was deleted from the repository', () => {
    const problems = findProblems([], state, new Map([['dbo.SP_Orders_Create', 'abc']]));
    expect(problems.some((problem) => problem.startsWith('OBJECT_REMOVED'))).toBe(true);
  });

  it('reports an object changed by hand and one that vanished', () => {
    expect(findProblems([file], state, new Map([['dbo.SP_Orders_Create', 'zzz']]))[0]).toMatch(
      /OBJECT_MODIFIED/,
    );
    expect(findProblems([file], state, new Map())[0]).toMatch(/OBJECT_MISSING/);
  });
});
