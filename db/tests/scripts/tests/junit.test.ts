import { describe, expect, it } from 'vitest';
import { buildJUnitXml, summarise, type TestResultRow } from '../lib/junit.js';

const start = new Date('2026-10-29T10:00:00.000Z');
const end = new Date('2026-10-29T10:00:01.500Z');

function row(overrides: Partial<TestResultRow>): TestResultRow {
  return {
    Class: 'Money',
    TestCase: 'test rounds half to even',
    Result: 'Success',
    Msg: null,
    TestStartTime: start,
    TestEndTime: end,
    ...overrides,
  };
}

describe('summarise', () => {
  it('counts each outcome', () => {
    const rows = [
      row({}),
      row({ Result: 'Failure' }),
      row({ Result: 'Error' }),
      row({ Result: 'Skipped' }),
    ];
    expect(summarise(rows)).toEqual({ total: 4, failures: 1, errors: 1, skipped: 1 });
  });
});

describe('buildJUnitXml', () => {
  it('writes a passing test with its duration', () => {
    const xml = buildJUnitXml([row({})]);
    expect(xml).toContain(
      '<testsuites tests="1" failures="0" errors="0" skipped="0" time="1.500">',
    );
    expect(xml).toContain(
      '<testcase classname="Money" name="test rounds half to even" time="1.500"/>',
    );
  });

  it('groups tests by class', () => {
    const xml = buildJUnitXml([row({}), row({ Class: 'Orders', TestCase: 'test total' })]);
    expect(xml.match(/<testsuite /g)).toHaveLength(2);
  });

  it('reports failures, errors and skipped tests', () => {
    const xml = buildJUnitXml([
      row({ Result: 'Failure', Msg: 'Expected <1> but was <2>' }),
      row({ Result: 'Error', TestCase: 'b', Msg: 'boom' }),
      row({ Result: 'Skipped', TestCase: 'c' }),
    ]);
    expect(xml).toContain('<failure message="Expected &lt;1&gt; but was &lt;2&gt;">');
    expect(xml).toContain('<error message="boom">boom</error>');
    expect(xml).toContain('<skipped/>');
  });

  it('escapes quotes and drops characters XML cannot hold', () => {
    const xml = buildJUnitXml([row({ Result: 'Failure', Msg: 'say "hi" & \u0001bye' })]);
    expect(xml).toContain('say &quot;hi&quot; &amp; bye');
  });

  it('uses zero seconds when the times are missing', () => {
    const xml = buildJUnitXml([row({ TestStartTime: null, TestEndTime: null })]);
    expect(xml).toContain('time="0.000"');
  });

  it('produces an empty report for no rows', () => {
    expect(buildJUnitXml([])).toContain('<testsuites tests="0"');
  });
});
