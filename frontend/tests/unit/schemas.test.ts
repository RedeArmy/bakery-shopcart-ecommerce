// cspell:disable
import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../../src/features/auth/model/schemas';

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('loginSchema', () => {
  it('accepts a valid sign in and trims the e-mail', () => {
    const result = loginSchema.safeParse({ email: '  ana@shopcart.test ', password: 'x' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('ana@shopcart.test');
  });

  it('answers with i18n keys, so the Spanish text lives only in the resource files', () => {
    expect(messages(loginSchema.safeParse({ email: '', password: '' }))).toEqual([
      'auth.validation.emailRequired',
      'auth.validation.passwordRequired',
    ]);
    expect(messages(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }))).toEqual([
      'auth.validation.emailInvalid',
    ]);
  });
});

describe('registerSchema', () => {
  const valid = {
    fullName: 'Ana López',
    email: 'ana@shopcart.test',
    phone: '5555-0000',
    password: 'a long password',
  };

  it('accepts a valid registration, with or without a phone', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, phone: '' }).success).toBe(true);
  });

  it('applies the limits of the API', () => {
    expect(messages(registerSchema.safeParse({ ...valid, password: 'short' }))).toEqual([
      'auth.validation.passwordShort',
    ]);
    expect(messages(registerSchema.safeParse({ ...valid, password: 'a'.repeat(129) }))).toEqual([
      'auth.validation.passwordLong',
    ]);
    expect(messages(registerSchema.safeParse({ ...valid, fullName: '   ' }))).toEqual([
      'auth.validation.nameRequired',
    ]);
    expect(messages(registerSchema.safeParse({ ...valid, fullName: 'a'.repeat(121) }))).toEqual([
      'auth.validation.nameLong',
    ]);
  });

  it.each(['abc', '12', '1'.repeat(21), '55<script>'])('rejects the phone %j', (phone) => {
    expect(messages(registerSchema.safeParse({ ...valid, phone }))).toEqual([
      'auth.validation.phoneInvalid',
    ]);
  });
});
