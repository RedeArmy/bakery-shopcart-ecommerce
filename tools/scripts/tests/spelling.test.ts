// cspell:ignore botón fila comentario
import { describe, expect, it } from 'vitest';
import { findPathViolations, findViolations, splitWords, stripComments } from '../lib/spelling.js';

describe('british spelling checker', () => {
  it('splits camelCase, kebab-case and SCREAMING_SNAKE identifiers', () => {
    expect(splitWords('backgroundColor')).toEqual(['background', 'Color']);
    expect(splitWords('PAYMENT_METHOD')).toEqual(['PAYMENT', 'METHOD']);
    expect(splitWords('order-status')).toEqual(['order', 'status']);
  });

  it('flags US spellings inside identifiers', () => {
    const result = findViolations('const orderCanceled = authorizeUser();', '.ts');
    expect(result.map((v) => v.found)).toEqual(['Canceled', 'authorize']);
  });

  it('accepts the British forms', () => {
    expect(findViolations('const orderCancelled = authoriseUser(); // color', '.ts')).toEqual([]);
  });

  it('ignores comments, which are written in Spanish', () => {
    expect(findViolations('// el color del botón\nconst x = 1;', '.ts')).toEqual([]);
    expect(findViolations('-- color de la fila\nSELECT 1;', '.sql')).toEqual([]);
  });

  it('does not treat a URL or a hash inside a word as a comment', () => {
    expect(stripComments("const url = 'https://a.test'; // nota", '.ts')).toBe(
      "const url = 'https://a.test';        ",
    );
    expect(stripComments('key: a#b # comentario', '.yml')).toBe('key: a#b             ');
  });

  it('keeps the line numbers after stripping comments', () => {
    const text = '/* uno\n dos */\nconst gray = 1;';
    expect(stripComments(text, '.ts').split('\n')).toHaveLength(3);
    expect(findViolations(text, '.ts')[0]?.line).toBe(3);
  });

  it('allows third-party tokens and honours the ignore markers', () => {
    expect(findViolations('The Authorization header', '.md')).toEqual([]);
    expect(findViolations('use color here <!-- spelling-ignore -->', '.md')).toEqual([]);
    expect(
      findViolations(
        '<!-- spelling-ignore-start -->\ncolor\n<!-- spelling-ignore-end -->\ncolor',
        '.md',
      ),
    ).toHaveLength(1);
  });

  it('checks file and folder names', () => {
    expect(findPathViolations('order-canceled.ts')).toHaveLength(1);
    expect(findPathViolations('order-cancelled.ts')).toEqual([]);
  });
});
