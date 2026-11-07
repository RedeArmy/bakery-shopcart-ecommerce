import { describe, expect, it } from 'vitest';
import { hasAccount, hasContact, isGuestSession } from '../../src/shared/auth/accounts';
import { createAuth } from '../../src/shared/auth/session';
import { createSessionStore } from '../../src/shared/auth/session-store';
import type { SessionHint, SessionState } from '../../src/shared/auth/session-store';
import { apiError, guestSession, installFakeApi, json, session } from './support/fake-api';

const memoryHint = (): SessionHint => {
  let value = false;
  return {
    has: () => value,
    set: () => {
      value = true;
    },
    clear: () => {
      value = false;
    },
  };
};

const build = () => {
  const store = createSessionStore();
  const auth = createAuth({ baseUrl: 'http://localhost', store, hint: memoryHint() });
  return { auth, store };
};

describe('guest session', () => {
  it('opens a guest session without a token and keeps the access token in memory', async () => {
    const { calls } = installFakeApi({ 'POST /api/v1/auth/guest': json(guestSession()) });
    const { auth, store } = build();
    const user = await auth.startGuest();

    expect(user.isGuest).toBe(true);
    expect(store.get()).toMatchObject({ status: 'authenticated', accessToken: 'guest-token' });
    // Abrir la sesión no lleva token ni cuerpo
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
    expect(calls[0]?.body).toBeUndefined();
  });

  it('shows the error of the server when the session cannot be opened and does not renew', async () => {
    const { calls } = installFakeApi({ 'POST /api/v1/auth/guest': apiError(429, 'RATE_LIMITED') });
    const { auth, store } = build();
    await expect(auth.startGuest()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(store.get().status).toBe('unknown');
    // Un 401 en una ruta pública no dispara una renovación
    expect(calls.filter((call) => call.path.endsWith('/refresh'))).toHaveLength(0);
  });

  it('recovers the session of a guest with the email and the code', async () => {
    const { calls } = installFakeApi({
      'POST /api/v1/auth/guest/recover': json(guestSession(9, 'maria@example.test')),
    });
    const { auth, store } = build();
    await auth.recoverGuest('maria@example.test', 'ABCDE12345');
    expect(calls[0]?.body).toEqual({ email: 'maria@example.test', code: 'ABCDE12345' });
    expect(store.get().user?.email).toBe('maria@example.test');
  });

  it('does not renew when a wrong code answers 401: nothing was signed in', async () => {
    const { calls } = installFakeApi({
      'POST /api/v1/auth/guest/recover': apiError(401, 'RECOVERY_INVALID'),
    });
    const { auth } = build();
    await expect(auth.recoverGuest('a@b.test', 'x')).rejects.toMatchObject({
      code: 'RECOVERY_INVALID',
    });
    expect(calls).toHaveLength(1);
  });

  it('updates the user of the session without touching the tokens', async () => {
    installFakeApi({ 'POST /api/v1/auth/guest': json(guestSession()) });
    const { auth, store } = build();
    await auth.startGuest();
    auth.updateUser({ ...guestSession().user, role: 'Customer', email: 'maria@example.test' });
    expect(store.get()).toMatchObject({ accessToken: 'guest-token' });
    expect(store.get().user?.email).toBe('maria@example.test');
  });

  it('ignores an update when there is no session', () => {
    const { auth, store } = build();
    auth.updateUser({ ...session().user, role: 'Customer' });
    expect(store.get().user).toBeNull();
  });
});

describe('account helpers', () => {
  const authenticated = (isGuest: boolean, email = 'ana@shopcart.test'): SessionState => ({
    status: 'authenticated',
    accessToken: 't',
    user: { ...session().user, role: 'Customer', email, isGuest },
  });

  it('tells a registered account from a guest and from nobody', () => {
    expect(hasAccount(authenticated(false))).toBe(true);
    expect(hasAccount(authenticated(true))).toBe(false);
    expect(hasAccount({ status: 'anonymous', user: null })).toBe(false);
    expect(hasAccount({ status: 'unknown', user: null })).toBe(false);
    expect(isGuestSession(authenticated(true))).toBe(true);
    expect(isGuestSession(authenticated(false))).toBe(false);
    expect(isGuestSession({ status: 'anonymous', user: null })).toBe(false);
  });

  it('knows whether the guest already gave a real email', () => {
    expect(hasContact({ email: 'guest-1@guest.invalid' })).toBe(false);
    expect(hasContact({ email: 'maria@example.test' })).toBe(true);
  });
});
