import { describe, expect, it } from 'vitest';
import { readCookie } from '../../src/platform/http/cookies.js';

const withCookie = (cookie?: string) => ({ headers: cookie === undefined ? {} : { cookie } });

describe('readCookie', () => {
  it('returns undefined when there is no Cookie header or the cookie is not there', () => {
    expect(readCookie(withCookie(), 'refreshToken')).toBeUndefined();
    expect(readCookie(withCookie('theme=dark'), 'refreshToken')).toBeUndefined();
  });

  it('finds the cookie among others, whatever the spacing', () => {
    expect(readCookie(withCookie('theme=dark; refreshToken=abc123;lang=es'), 'refreshToken')).toBe(
      'abc123',
    );
    expect(readCookie(withCookie('  refreshToken = abc123 '), 'refreshToken')).toBe('abc123');
  });

  it('matches the whole name, not a longer name that merely contains it', () => {
    expect(readCookie(withCookie('refreshTokenOld=nope'), 'refreshToken')).toBeUndefined();
  });

  it('takes the first pair when the name repeats', () => {
    expect(readCookie(withCookie('refreshToken=first; refreshToken=second'), 'refreshToken')).toBe(
      'first',
    );
  });

  it('decodes percent-encoding and strips the quotes', () => {
    expect(readCookie(withCookie('refreshToken=a%2Bb'), 'refreshToken')).toBe('a+b');
    expect(readCookie(withCookie('refreshToken="quoted"'), 'refreshToken')).toBe('quoted');
  });

  it('ignores a value that is not valid percent-encoding instead of throwing', () => {
    expect(readCookie(withCookie('refreshToken=%E0%A4%A'), 'refreshToken')).toBeUndefined();
  });

  it('keeps an equals sign inside the value', () => {
    expect(readCookie(withCookie('refreshToken=abc=='), 'refreshToken')).toBe('abc==');
  });
});
