import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthenticate, requireRole } from '../../src/platform/http/authentication.js';
import { createErrorHandler } from '../../src/platform/http/error-handler.js';
import { createIdempotency } from '../../src/platform/idempotency/idempotency.js';
import type {
  BeginResult,
  IdempotencyRequest,
  IdempotencyStorePort,
} from '../../src/platform/idempotency/idempotency.js';
import { createLogger } from '../../src/platform/logging/logger.js';
import {
  POLICIES,
  createMemoryRateLimitStore,
  createRateLimiter,
} from '../../src/platform/rate-limit/rate-limit.js';
import { argon2PasswordHasher } from '../../src/platform/security/passwords.js';
import { createTokenService } from '../../src/platform/security/tokens.js';

const errorCode = (response: { body: unknown }): string =>
  (response.body as { error: { code: string } }).error.code;

const logger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });
let nowMs = Date.parse('2030-06-01T12:00:00Z');
const clock = { now: () => new Date(nowMs) };
const tokens = createTokenService(
  {
    accessSecret: 'a-test-secret-of-sufficient-length',
    refreshPepper: 'a-test-pepper-of-sufficient-length',
    accessMinutes: 15,
    refreshDays: 7,
  },
  clock,
);

describe('token service', () => {
  it('signs an access token that verifies and carries the user and the role', async () => {
    const token = await tokens.signAccess({ idUser: 7, role: 'Operator' });
    expect(await tokens.verifyAccess(token)).toEqual({ idUser: 7, role: 'Operator' });
  });

  it('rejects an expired token, a tampered token and garbage', async () => {
    const token = await tokens.signAccess({ idUser: 7, role: 'Customer' });
    const original = nowMs;
    nowMs += 16 * 60 * 1000;
    expect(await tokens.verifyAccess(token)).toBeNull();
    nowMs = original;
    expect(await tokens.verifyAccess(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(await tokens.verifyAccess('not.a.token')).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const other = createTokenService(
      {
        accessSecret: 'another-secret-of-sufficient-length',
        refreshPepper: 'p'.repeat(30),
        accessMinutes: 15,
        refreshDays: 7,
      },
      clock,
    );
    expect(
      await tokens.verifyAccess(await other.signAccess({ idUser: 1, role: 'Administrator' })),
    ).toBeNull();
  });

  it('issues opaque refresh tokens whose stored hash is deterministic and peppered', () => {
    const first = tokens.newRefreshToken();
    const second = tokens.newRefreshToken();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hashRefresh(first.token)).toBe(first.hash);
    expect(first.expiresAt.getTime()).toBe(nowMs + 7 * 24 * 3600 * 1000);
  });
});

describe('password hasher', () => {
  it('hashes with argon2id, verifies the right password and refuses the wrong one', async () => {
    const stored = await argon2PasswordHasher.hash('correct horse battery');
    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(await argon2PasswordHasher.verify(stored, 'correct horse battery')).toBe(true);
    expect(await argon2PasswordHasher.verify(stored, 'wrong')).toBe(false);
  });

  it('treats a malformed stored hash as a wrong password', async () => {
    expect(await argon2PasswordHasher.verify('not-a-hash', 'anything')).toBe(false);
  });
});

function appWith(configure: (app: express.Express) => void): express.Express {
  const app = express();
  app.use((_req, res, next) => {
    res.locals['requestId'] = 'test-request';
    next();
  });
  app.use(express.json());
  configure(app);
  app.use(createErrorHandler(logger));
  return app;
}

describe('authentication middleware', () => {
  const protectedApp = appWith((app) => {
    app.get('/me', createAuthenticate(tokens), (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/admin', createAuthenticate(tokens), requireRole('Administrator'), (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/either', createAuthenticate(tokens, { optional: true }), (_req, res) => {
      res.json({ ok: true });
    });
  });

  it('answers 401 without a token and 401 with an invalid one', async () => {
    expect(errorCode(await request(protectedApp).get('/me'))).toBe('UNAUTHENTICATED');
    const bad = await request(protectedApp).get('/me').set('Authorization', 'Bearer nope');
    expect(bad.status).toBe(401);
    expect(errorCode(bad)).toBe('TOKEN_INVALID');
  });

  it('lets a valid token through and answers 403 when the role is not enough', async () => {
    const customer = await tokens.signAccess({ idUser: 1, role: 'Customer' });
    expect(
      (await request(protectedApp).get('/me').set('Authorization', `Bearer ${customer}`)).status,
    ).toBe(200);
    const forbidden = await request(protectedApp)
      .get('/admin')
      .set('Authorization', `Bearer ${customer}`);
    expect(forbidden.status).toBe(403);
    const admin = await tokens.signAccess({ idUser: 2, role: 'Administrator' });
    expect(
      (await request(protectedApp).get('/admin').set('Authorization', `Bearer ${admin}`)).status,
    ).toBe(200);
  });

  it('lets a visitor through an optional route but never an invalid token', async () => {
    expect((await request(protectedApp).get('/either')).status).toBe(200);
    expect(
      (await request(protectedApp).get('/either').set('Authorization', 'Bearer nope')).status,
    ).toBe(401);
  });
});

class FakeStore implements IdempotencyStorePort {
  readonly calls: string[] = [];
  nextBegin: BeginResult = {
    outcome: 'New',
    httpStatus: null,
    responseBody: null,
    retryAfterSeconds: null,
  };
  completed: { httpStatus: number; body: string } | undefined;

  begin(): Promise<BeginResult> {
    this.calls.push('begin');
    return Promise.resolve(this.nextBegin);
  }
  complete(request: IdempotencyRequest & { httpStatus: number; body: string }): Promise<void> {
    this.calls.push('complete');
    this.completed = { httpStatus: request.httpStatus, body: request.body };
    return Promise.resolve();
  }
  fail(): Promise<void> {
    this.calls.push('fail');
    return Promise.resolve();
  }
}

describe('idempotency middleware', () => {
  const build = (store: FakeStore, handler: express.RequestHandler) => {
    const idempotent = createIdempotency(store, logger);
    return appWith((app) => {
      app.post(
        '/orders/:id/cancel',
        createAuthenticate(tokens),
        idempotent({ required: true }),
        handler,
      );
    });
  };
  const ok: express.RequestHandler = (_req, res) => {
    res.status(201).json({ done: true });
  };
  const auth = async () => `Bearer ${await tokens.signAccess({ idUser: 5, role: 'Customer' })}`;

  it('refuses a mutating request without the key', async () => {
    const response = await request(build(new FakeStore(), ok))
      .post('/orders/1/cancel')
      .set('Authorization', await auth())
      .send({});
    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('refuses a key with an invalid format', async () => {
    const response = await request(build(new FakeStore(), ok))
      .post('/orders/1/cancel')
      .set('Authorization', await auth())
      .set('Idempotency-Key', 'short')
      .send({});
    expect(errorCode(response)).toBe('IDEMPOTENCY_KEY_INVALID');
  });

  it('runs the operation for a new key and stores the response before sending it', async () => {
    const store = new FakeStore();
    const response = await request(build(store, ok))
      .post('/orders/1/cancel')
      .set('Authorization', await auth())
      .set('Idempotency-Key', 'key-0001-abcd')
      .send({});
    expect(response.status).toBe(201);
    expect(store.calls).toEqual(['begin', 'complete']);
    expect(store.completed).toEqual({ httpStatus: 201, body: '{"done":true}' });
  });

  it('replays the stored response without running the operation', async () => {
    const store = new FakeStore();
    store.nextBegin = {
      outcome: 'Replay',
      httpStatus: 201,
      responseBody: '{"done":true}',
      retryAfterSeconds: null,
    };
    let ran = false;
    const response = await request(
      build(store, (_req, res) => {
        ran = true;
        res.json({});
      }),
    )
      .post('/orders/1/cancel')
      .set('Authorization', await auth())
      .set('Idempotency-Key', 'key-0001-abcd')
      .send({});
    expect(response.status).toBe(201);
    expect(response.headers['idempotent-replayed']).toBe('true');
    expect(response.body).toEqual({ done: true });
    expect(ran).toBe(false);
  });

  it('answers 409 with Retry-After while the first request is running', async () => {
    const store = new FakeStore();
    store.nextBegin = {
      outcome: 'InProgress',
      httpStatus: null,
      responseBody: null,
      retryAfterSeconds: 12,
    };
    const response = await request(build(store, ok))
      .post('/orders/1/cancel')
      .set('Authorization', await auth())
      .set('Idempotency-Key', 'key-0001-abcd')
      .send({});
    expect(response.status).toBe(409);
    expect(response.headers['retry-after']).toBe('12');
    expect(errorCode(response)).toBe('REQUEST_IN_PROGRESS');
  });

  it('answers 422 when the same key arrives with another body', async () => {
    const store = new FakeStore();
    store.nextBegin = {
      outcome: 'Mismatch',
      httpStatus: null,
      responseBody: null,
      retryAfterSeconds: null,
    };
    const response = await request(build(store, ok))
      .post('/orders/1/cancel')
      .set('Authorization', await auth())
      .set('Idempotency-Key', 'key-0001-abcd')
      .send({ other: 1 });
    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('does not store a 5xx and frees the key so it can be retried', async () => {
    const store = new FakeStore();
    const response = await request(
      build(store, (_req, res) => {
        res.status(500).json({ error: 'boom' });
      }),
    )
      .post('/orders/1/cancel')
      .set('Authorization', await auth())
      .set('Idempotency-Key', 'key-0001-abcd')
      .send({});
    expect(response.status).toBe(500);
    expect(store.calls).toEqual(['begin', 'fail']);
  });

  it('stores a deterministic 4xx so the same answer is replayed', async () => {
    const store = new FakeStore();
    await request(
      build(store, (_req, res) => {
        res.status(422).json({ error: 'rule' });
      }),
    )
      .post('/orders/1/cancel')
      .set('Authorization', await auth())
      .set('Idempotency-Key', 'key-0001-abcd')
      .send({});
    expect(store.completed?.httpStatus).toBe(422);
  });
});

describe('rate limiting', () => {
  it('lets the limit through, then answers 429 with Retry-After and the RateLimit headers', async () => {
    const limiter = createRateLimiter(createMemoryRateLimitStore(), clock);
    const app = appWith((a) => {
      a.get('/x', limiter({ name: 'test', limit: 2, windowMs: 60_000 }), (_req, res) => {
        res.json({});
      });
    });
    expect((await request(app).get('/x')).headers['ratelimit-remaining']).toBe('1');
    expect((await request(app).get('/x')).status).toBe(200);
    const blocked = await request(app).get('/x');
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked)).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBe('60');
    expect(blocked.headers['ratelimit-limit']).toBe('2');
  });

  it('starts a new window once the previous one elapsed', async () => {
    const limiter = createRateLimiter(createMemoryRateLimitStore(), clock);
    const app = appWith((a) => {
      a.get('/x', limiter({ name: 'window', limit: 1, windowMs: 1000 }), (_req, res) => {
        res.json({});
      });
    });
    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(429);
    nowMs += 1500;
    expect((await request(app).get('/x')).status).toBe(200);
  });

  it('counts each user on their own when the route is authenticated', async () => {
    const limiter = createRateLimiter(createMemoryRateLimitStore(), clock);
    const app = appWith((a) => {
      a.get(
        '/x',
        createAuthenticate(tokens),
        limiter({ name: 'users', limit: 1, windowMs: 60_000 }),
        (_req, res) => {
          res.json({});
        },
      );
    });
    const one = `Bearer ${await tokens.signAccess({ idUser: 1, role: 'Customer' })}`;
    const two = `Bearer ${await tokens.signAccess({ idUser: 2, role: 'Customer' })}`;
    expect((await request(app).get('/x').set('Authorization', one)).status).toBe(200);
    expect((await request(app).get('/x').set('Authorization', two)).status).toBe(200);
    expect((await request(app).get('/x').set('Authorization', one)).status).toBe(429);
  });

  it('defines the documented policies', () => {
    expect(POLICIES.authentication.limit).toBe(5);
    expect(POLICIES.checkoutConfirm.limit).toBe(5);
    expect(POLICIES.global.limit).toBe(300);
  });
});
