import { describe, expect, it } from 'vitest';
import {
  checkFigures,
  countIntegrationFlows,
  countOperations,
  countPostman,
  countTsqltTests,
} from '../lib/figures.js';
import type { FigureRule } from '../lib/figures.js';

const rule = (actual: number, regex: RegExp): FigureRule => ({
  label: 'tests',
  actual,
  patterns: [{ file: 'README.md', regex }],
});

describe('checkFigures', () => {
  it('accepts a figure that matches the repository', () => {
    expect(
      checkFigures({ 'README.md': 'There are 537 tests.' }, [rule(537, /(\d+) tests/)]),
    ).toEqual([]);
  });

  it('names the file, the figure that is cited and the real one when they differ', () => {
    const problems = checkFigures({ 'README.md': 'There are 523 tests.' }, [
      rule(537, /(\d+) tests/),
    ]);
    expect(problems).toEqual(['tests: README.md says 523 but the repository has 537']);
  });

  it('checks every place where the figure is cited, not only the first', () => {
    const text = '537 tests here and 523 tests there';
    expect(checkFigures({ 'README.md': text }, [rule(537, /(\d+) tests/)])).toHaveLength(1);
  });

  it('reports a sentence that disappeared, so a rule can never go silent', () => {
    const problems = checkFigures({ 'README.md': 'nothing about it' }, [rule(1, /(\d+) tests/)]);
    expect(problems[0]).toContain('no longer has the sentence');
  });

  it('reports a document that was not read', () => {
    expect(checkFigures({}, [rule(1, /(\d+) tests/)])).toEqual(['tests: README.md was not read']);
  });
});

describe('counting the sources', () => {
  it('counts the tSQLt cases and ignores the set-up procedures', () => {
    const sql = [
      'CREATE PROCEDURE Test_Cart.SetUp',
      'CREATE PROCEDURE Test_Cart.[test adds an item]',
      'CREATE PROCEDURE Test_Cart.[test removes an item]',
      '-- CREATE PROCEDURE Test_Cart.[test is a comment]',
    ].join('\n');
    expect(countTsqltTests(sql)).toBe(2);
  });

  it('counts the operations of the contract by their verbs', () => {
    const yaml = [
      'paths:',
      '  /a:',
      '    get:',
      '      tags: []',
      '    post:',
      '  /b:',
      '    delete:',
      'components:',
    ].join('\n');
    expect(countOperations(yaml)).toBe(3);
  });

  it('counts the top-level cases of the integration suite', () => {
    const source = [
      "describe('x', () => {",
      "  it('one', () => {});",
      "  it('two', () => {});",
      "    it('nested helper', () => {});",
      '});',
    ].join('\n');
    expect(countIntegrationFlows(source)).toBe(2);
  });

  it('counts requests and assertions of a Postman collection, folders included', () => {
    const collection = {
      item: [
        {
          item: [
            {
              request: {},
              event: [
                { listen: 'test', script: { exec: ['pm.test("a", f);', 'pm.test("b", g);'] } },
              ],
            },
          ],
        },
        {
          request: {},
          event: [{ listen: 'prerequest', script: { exec: ['pm.test("not an assertion")'] } }],
        },
      ],
    };
    expect(countPostman(collection)).toEqual({ requests: 2, assertions: 2 });
  });
});
