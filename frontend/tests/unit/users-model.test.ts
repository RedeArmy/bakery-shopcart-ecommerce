// cspell:disable
import { describe, expect, it } from 'vitest';
import {
  activeFromValue,
  activeValue,
  isLocked,
  parseUsersQuery,
  usersParams,
} from '../../src/features/users/model/users';

const parse = (search: string) => parseUsersQuery(new URLSearchParams(search));

describe('the users query', () => {
  it('starts with everything: no text, any role, any status, first page', () => {
    expect(parse('')).toEqual({ search: '', role: null, active: null, page: 1 });
  });

  it('reads the text, the role, the status and the page from the address', () => {
    expect(parse('q=%20ana%20&role=2&active=false&page=3')).toEqual({
      search: 'ana',
      role: 2,
      active: false,
      page: 3,
    });
    expect(parse('active=true').active).toBe(true);
  });

  it('falls back to the default for what it does not understand', () => {
    expect(parse('role=9&active=maybe&page=0')).toEqual({
      search: '',
      role: null,
      active: null,
      page: 1,
    });
    expect(parse('role=abc&page=1.5').role).toBeNull();
    expect(parse('page=1.5').page).toBe(1);
  });

  it('cuts a text that is too long', () => {
    expect(parse(`q=${'a'.repeat(300)}`).search).toHaveLength(100);
  });

  it('writes only what differs from the default', () => {
    expect(usersParams({ search: '', role: null, active: null, page: 1 }).toString()).toBe('');
    expect(usersParams({ search: 'ana', role: 3, active: true, page: 2 }).toString()).toBe(
      'q=ana&role=3&active=true&page=2',
    );
  });
});

describe('the status selector', () => {
  it('maps the three choices both ways', () => {
    expect(activeValue(null)).toBe('');
    expect(activeValue(true)).toBe('true');
    expect(activeValue(false)).toBe('false');
    expect(activeFromValue('')).toBeNull();
    expect(activeFromValue('true')).toBe(true);
    expect(activeFromValue('false')).toBe(false);
  });
});

describe('the lock of an account', () => {
  const now = new Date('2030-06-01T12:00:00Z');

  it('is locked only until a date in the future', () => {
    expect(isLocked('2030-06-01T12:30:00Z', now)).toBe(true);
    expect(isLocked('2030-06-01T11:59:00Z', now)).toBe(false);
  });

  it('is not locked without a date or with one that is not a date', () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(undefined, now)).toBe(false);
    expect(isLocked('nonsense', now)).toBe(false);
  });
});
