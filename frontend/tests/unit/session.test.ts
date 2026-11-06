import { describe, expect, it } from 'vitest';
import { createAuth } from '../../src/shared/auth/session';
import { createSessionStore } from '../../src/shared/auth/session-store';
import type { SessionHint } from '../../src/shared/auth/session-store';
import { apiError, installFakeApi, json, session } from './support/fake-api';

const memoryHint = (initial = false): SessionHint & { value: boolean } => {
  const hint = {
    value: initial,
    has: () => hint.value,
    set: () => {
      hint.value = true;
    },
    clear: () => {
      hint.value = false;
    },
  };
  return hint;
};

const build = (hint = memoryHint()) => {
  const store = createSessionStore();
  const auth = createAuth({ baseUrl: 'http://localhost', store, hint });
  return { auth, store, hint };
};

describe('session restore', () => {
  it('treats a browser with no previous session as anonymous without calling the server', async () => {
    const { calls } = installFakeApi({});
    const { auth, store } = build(memoryHint(false));
    await auth.restore();
    expect(store.get().status).toBe('anonymous');
    expect(calls).toEqual([]);
  });

  it('recovers the session through the cookie when the browser had one', async () => {
    const { calls } = installFakeApi({ 'POST /api/v1/auth/refresh': json(session('Ana')) });
    const { auth, store } = build(memoryHint(true));
    await auth.restore();
    expect(store.get()).toMatchObject({ status: 'authenticated', accessToken: 'token-1' });
    expect(store.get().user?.fullName).toBe('Ana');
    // La renovación no lleva cuerpo ni token: la credencial es la cookie, que el navegador manda sola
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
  });

  it('forgets the hint and becomes anonymous when the cookie is no longer valid', async () => {
    installFakeApi({ 'POST /api/v1/auth/refresh': apiError(401, 'REFRESH_TOKEN_INVALID') });
    const { auth, store, hint } = build(memoryHint(true));
    await auth.restore();
    expect(store.get().status).toBe('anonymous');
    expect(hint.value).toBe(false);
  });

  it('becomes anonymous but keeps the hint when there is no network, so the next load tries again', async () => {
    installFakeApi({ 'POST /api/v1/auth/refresh': () => Promise.reject(new TypeError('offline')) });
    const { auth, store, hint } = build(memoryHint(true));
    await auth.restore();
    expect(store.get().status).toBe('anonymous');
    expect(hint.value).toBe(true);
  });

  it('only restores once', async () => {
    const { calls } = installFakeApi({ 'POST /api/v1/auth/refresh': json(session()) });
    const { auth } = build(memoryHint(true));
    await auth.restore();
    await auth.restore();
    expect(calls).toHaveLength(1);
  });
});

describe('sign in, register and sign out', () => {
  it('signs in, keeps the token in memory and remembers the browser had a session', async () => {
    const { calls } = installFakeApi({ 'POST /api/v1/auth/login': json(session('Ana')) });
    const { auth, store, hint } = build();
    const user = await auth.login('ana@shopcart.test', 'a long password');
    expect(user.fullName).toBe('Ana');
    expect(store.get()).toMatchObject({ status: 'authenticated', accessToken: 'token-1' });
    expect(hint.value).toBe(true);
    expect(calls[0]?.body).toEqual({ email: 'ana@shopcart.test', password: 'a long password' });
  });

  it('turns a rejected sign in into an ApiError and leaves the session untouched', async () => {
    installFakeApi({ 'POST /api/v1/auth/login': apiError(401, 'INVALID_CREDENTIALS') });
    const { auth, store } = build();
    await expect(auth.login('a@b.test', 'x')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(store.get().status).toBe('unknown');
  });

  it('registers and then signs in with the same credentials', async () => {
    const { calls } = installFakeApi({
      'POST /api/v1/auth/register': json({ idUser: 2 }, { status: 201 }),
      'POST /api/v1/auth/login': json(session('Bea')),
    });
    const { auth, store } = build();
    await auth.register({
      email: 'bea@shopcart.test',
      password: 'a long password',
      fullName: 'Bea',
    });
    expect(calls.map((call) => call.path)).toEqual(['/api/v1/auth/register', '/api/v1/auth/login']);
    expect(calls[0]?.body).toMatchObject({ fullName: 'Bea', phone: null });
    expect(store.get().status).toBe('authenticated');
  });

  it('signs out locally even when the server does not answer', async () => {
    installFakeApi({
      'POST /api/v1/auth/login': json(session()),
      'POST /api/v1/auth/logout': () => Promise.reject(new TypeError('offline')),
    });
    const { auth, store, hint } = build();
    await auth.login('a@b.test', 'x');
    await expect(auth.logout()).rejects.toThrow('offline');
    expect(store.get()).toMatchObject({ status: 'anonymous', accessToken: null });
    expect(hint.value).toBe(false);
  });
});

describe('the authenticated client', () => {
  it('sends the access token on every call that is not part of authentication', async () => {
    const { calls } = installFakeApi({
      'POST /api/v1/auth/login': json(session('Ana', 'Customer', 'token-A')),
      'GET /api/v1/auth/me': json(session().user),
    });
    const { auth } = build();
    await auth.login('a@b.test', 'x');
    await auth.api.GET('/api/v1/auth/me');
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
    expect(calls[1]?.headers.get('Authorization')).toBe('Bearer token-A');
  });

  it('renews once and repeats the request with the new token when the token expired', async () => {
    let renewals = 0;
    const { calls } = installFakeApi({
      'POST /api/v1/auth/login': json(session('Ana', 'Customer', 'old')),
      'POST /api/v1/auth/refresh': () => {
        renewals += 1;
        return json(session('Ana', 'Customer', 'new'));
      },
      'GET /api/v1/auth/me': (call) =>
        call.headers.get('Authorization') === 'Bearer new'
          ? json(session().user)
          : apiError(401, 'TOKEN_INVALID'),
    });
    const { auth, store } = build();
    await auth.login('a@b.test', 'x');
    const result = await auth.api.GET('/api/v1/auth/me');
    expect(result.response.status).toBe(200);
    expect(renewals).toBe(1);
    expect(store.get().accessToken).toBe('new');
    expect(calls.filter((call) => call.path === '/api/v1/auth/me')).toHaveLength(2);
  });

  it('runs a single renewal when several requests fail at the same time (single-flight)', async () => {
    let renewals = 0;
    installFakeApi({
      'POST /api/v1/auth/login': json(session('Ana', 'Customer', 'old')),
      'POST /api/v1/auth/refresh': async () => {
        renewals += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return json(session('Ana', 'Customer', 'new'));
      },
      'GET /api/v1/auth/me': (call) =>
        call.headers.get('Authorization') === 'Bearer new'
          ? json(session().user)
          : apiError(401, 'TOKEN_INVALID'),
    });
    const { auth } = build();
    await auth.login('a@b.test', 'x');
    const results = await Promise.all([
      auth.api.GET('/api/v1/auth/me'),
      auth.api.GET('/api/v1/auth/me'),
      auth.api.GET('/api/v1/auth/me'),
    ]);
    expect(results.map((result) => result.response.status)).toEqual([200, 200, 200]);
    expect(renewals).toBe(1);
  });

  it('keeps the idempotency key and the body when it repeats a request after renewing', async () => {
    const { calls } = installFakeApi({
      'POST /api/v1/auth/login': json(session('Ana', 'Customer', 'old')),
      'POST /api/v1/auth/refresh': json(session('Ana', 'Customer', 'new')),
      'POST /api/v1/cart/coupon': (call) =>
        call.headers.get('Authorization') === 'Bearer new'
          ? json({ ok: true })
          : apiError(401, 'TOKEN_INVALID'),
    });
    const { auth } = build();
    await auth.login('a@b.test', 'x');
    await auth.api.POST('/api/v1/cart/coupon', {
      params: { header: { 'Idempotency-Key': 'key-12345678' } },
      body: { code: 'WELCOME10' },
    });
    const coupon = calls.filter((call) => call.path === '/api/v1/cart/coupon');
    expect(coupon).toHaveLength(2);
    expect(coupon[1]?.headers.get('Idempotency-Key')).toBe('key-12345678');
    expect(coupon[1]?.body).toEqual({ code: 'WELCOME10' });
  });

  it('ends the session and returns the 401 when the renewal is refused', async () => {
    installFakeApi({
      'POST /api/v1/auth/login': json(session('Ana', 'Customer', 'old')),
      'POST /api/v1/auth/refresh': apiError(401, 'REFRESH_TOKEN_REUSED'),
      'GET /api/v1/auth/me': apiError(401, 'TOKEN_INVALID'),
    });
    const { auth, store } = build();
    await auth.login('a@b.test', 'x');
    const result = await auth.api.GET('/api/v1/auth/me');
    expect(result.response.status).toBe(401);
    expect(store.get().status).toBe('anonymous');
  });

  it('does not try to renew for a visitor with no session who gets a 401', async () => {
    const { calls } = installFakeApi({ 'GET /api/v1/auth/me': apiError(401, 'UNAUTHENTICATED') });
    const { auth } = build();
    const result = await auth.api.GET('/api/v1/auth/me');
    expect(result.response.status).toBe(401);
    expect(calls.map((call) => call.path)).toEqual(['/api/v1/auth/me']);
  });
});
