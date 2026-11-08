import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../src/modules/auth/application/auth-service.js';
import type {
  AuthRepositoryPort,
  LoginRecord,
  RotateOutcome,
  UserRecord,
} from '../../src/modules/auth/application/auth-service.js';
import { createAuthRouter } from '../../src/modules/auth/presentation/auth.routes.js';
import { createAuthenticate } from '../../src/platform/http/authentication.js';
import { createErrorHandler } from '../../src/platform/http/error-handler.js';
import { createLogger } from '../../src/platform/logging/logger.js';
import type { PasswordHasher } from '../../src/platform/security/passwords.js';
import { createTokenService } from '../../src/platform/security/tokens.js';
import { AppError } from '../../src/shared-kernel/index.js';

const logger = createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' });
const clock = { now: () => new Date('2030-06-01T12:00:00Z') };
const tokens = createTokenService(
  {
    accessSecret: 'a-test-secret-of-sufficient-length',
    refreshPepper: 'a-test-pepper-of-sufficient-length',
    accessMinutes: 15,
    refreshDays: 7,
  },
  clock,
);

// Un hash reversible y rápido: lo que se prueba aquí es el flujo, no argon2
const hasher: PasswordHasher = {
  hash: (plain) => Promise.resolve(`hashed:${plain}`),
  verify: (stored, plain) => Promise.resolve(stored === `hashed:${plain}`),
};

const errorCodeOf = (response: { body: unknown }): string =>
  (response.body as { error: { code: string } }).error.code;

class FakeRepository implements AuthRepositoryPort {
  readonly users: LoginRecord[] = [];
  readonly saved: { idUser: number; tokenHash: string }[] = [];
  failedAttempts: string[] = [];
  successes: number[] = [];
  revoked: string[] = [];
  rotatedFrom: string[] = [];
  rotation: { outcome: RotateOutcome; idUser: number | null } = { outcome: 'Rotated', idUser: 1 };

  register(input: { email: string; passwordHash: string; fullName: string; phone: string | null }) {
    if (this.users.some((user) => user.email === input.email)) {
      return Promise.reject(new AppError(409, 'CONFLICT', 'duplicate'));
    }
    const idUser = this.users.length + 1;
    this.users.push({
      idUser,
      role: 'Customer',
      email: input.email,
      fullName: input.fullName,
      phone: input.phone,
      isActive: true,
      isGuest: false,
      passwordHash: input.passwordHash,
      isLocked: false,
      lockedUntil: null,
    });
    return Promise.resolve(idUser);
  }
  findByEmail(email: string) {
    return Promise.resolve(this.users.find((user) => user.email === email) ?? null);
  }
  findById(idUser: number): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.idUser === idUser) ?? null);
  }
  recordFailedAttempt(email: string) {
    this.failedAttempts.push(email);
    return Promise.resolve();
  }
  recordSuccessfulLogin(idUser: number) {
    this.successes.push(idUser);
    return Promise.resolve();
  }
  saveRefreshToken(input: { idUser: number; tokenHash: string }) {
    this.saved.push({ idUser: input.idUser, tokenHash: input.tokenHash });
    return Promise.resolve();
  }
  rotateRefreshToken(input: { tokenHash: string }) {
    this.rotatedFrom.push(input.tokenHash);
    return Promise.resolve(this.rotation);
  }
  revokeFamily(tokenHash: string) {
    this.revoked.push(tokenHash);
    return Promise.resolve();
  }
  createGuest() {
    const idUser = this.users.length + 1;
    this.users.push({
      idUser,
      role: 'Customer',
      email: `guest-${idUser}@guest.invalid`,
      fullName: 'Guest',
      phone: null,
      isActive: true,
      isGuest: true,
      passwordHash: '!',
      isLocked: false,
      lockedUntil: null,
    });
    return Promise.resolve(idUser);
  }
  setGuestContact(input: {
    idUser: number;
    email: string;
    fullName: string;
    phone: string | null;
  }) {
    if (this.users.some((user) => !user.isGuest && user.email === input.email)) {
      return Promise.reject(
        new AppError(409, 'EMAIL_BELONGS_TO_ACCOUNT', 'The email belongs to a registered account'),
      );
    }
    const user = this.users.find((candidate) => candidate.idUser === input.idUser);
    if (user === undefined)
      return Promise.reject(new AppError(404, 'NOT_FOUND', 'Account not found'));
    user.email = input.email;
    user.fullName = input.fullName;
    user.phone = input.phone;
    return Promise.resolve();
  }
}

const passThrough: express.RequestHandler = (_req, _res, next) => {
  next();
};

function build(repository: FakeRepository, secure = false) {
  const service = new AuthService(repository, hasher, tokens, clock, 15);
  const app = express();
  app.use((_req, res, next) => {
    res.locals['requestId'] = 'test-request';
    next();
  });
  app.use(express.json());
  app.use(
    createAuthRouter({
      service,
      authenticate: createAuthenticate(tokens),
      limitAuthentication: passThrough,
      limitRefresh: passThrough,
      refreshCookie: { maxAgeMs: 7 * 24 * 3600 * 1000, secure },
    }),
  );
  app.use(createErrorHandler(logger));
  return app;
}

const validRegistration = {
  email: 'Ana@Shopcart.test ',
  password: 'a long enough password',
  fullName: 'Ana',
};

describe('registration', () => {
  let repository: FakeRepository;
  beforeEach(() => {
    repository = new FakeRepository();
  });

  it('creates the account with a hashed password and a normalised email', async () => {
    const response = await request(build(repository))
      .post('/auth/register')
      .send(validRegistration);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ idUser: 1 });
    expect(repository.users[0]?.email).toBe('ana@shopcart.test');
    expect(repository.users[0]?.passwordHash).toBe('hashed:a long enough password');
  });

  it('answers 409 EMAIL_ALREADY_REGISTERED for a repeated email', async () => {
    const app = build(repository);
    await request(app).post('/auth/register').send(validRegistration);
    const again = await request(app).post('/auth/register').send(validRegistration);
    expect(again.status).toBe(409);
    expect(errorCodeOf(again)).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects a short password, an invalid email and a missing name', async () => {
    const app = build(repository);
    for (const body of [
      { ...validRegistration, password: 'short' },
      { ...validRegistration, email: 'not-an-email' },
      { email: 'a@b.test', password: 'a long enough password' },
    ]) {
      const response = await request(app).post('/auth/register').send(body);
      expect(response.status).toBe(400);
      expect(errorCodeOf(response)).toBe('VALIDATION_ERROR');
    }
  });
});

describe('login', () => {
  let repository: FakeRepository;
  beforeEach(async () => {
    repository = new FakeRepository();
    await request(build(repository)).post('/auth/register').send(validRegistration);
  });

  it('returns a session whose access token identifies the user and stores only the refresh hash', async () => {
    const response = await request(build(repository))
      .post('/auth/login')
      .send({ email: 'ana@shopcart.test', password: 'a long enough password' });
    expect(response.status).toBe(200);
    const body = response.body as { accessToken: string; refreshToken: string; expiresIn: number };
    expect(await tokens.verifyAccess(body.accessToken)).toEqual({ idUser: 1, role: 'Customer' });
    expect(body.expiresIn).toBe(900);
    expect(repository.saved[0]?.tokenHash).toBe(tokens.hashRefresh(body.refreshToken));
    expect(repository.saved[0]?.tokenHash).not.toBe(body.refreshToken);
    expect(repository.successes).toEqual([1]);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('answers the same 401 for a wrong password and for an unknown email, and counts the failure', async () => {
    const app = build(repository);
    const wrong = await request(app)
      .post('/auth/login')
      .send({ email: 'ana@shopcart.test', password: 'nope' });
    const unknown = await request(app)
      .post('/auth/login')
      .send({ email: 'who@shopcart.test', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(repository.failedAttempts).toEqual(['ana@shopcart.test']);
  });

  it('answers 423 without checking the password when the account is locked', async () => {
    const user = repository.users[0];
    if (user === undefined) throw new Error('missing user');
    user.isLocked = true;
    user.lockedUntil = new Date('2030-06-01T12:15:00Z');
    const response = await request(build(repository))
      .post('/auth/login')
      .send({ email: 'ana@shopcart.test', password: 'a long enough password' });
    expect(response.status).toBe(423);
    expect(errorCodeOf(response)).toBe('ACCOUNT_LOCKED');
    expect(repository.successes).toEqual([]);
  });

  it('answers 403 for a disabled account that has the right password', async () => {
    const user = repository.users[0];
    if (user === undefined) throw new Error('missing user');
    user.isActive = false;
    const response = await request(build(repository))
      .post('/auth/login')
      .send({ email: 'ana@shopcart.test', password: 'a long enough password' });
    expect(response.status).toBe(403);
    expect(errorCodeOf(response)).toBe('ACCOUNT_DISABLED');
  });
});

describe('refresh, logout and profile', () => {
  let repository: FakeRepository;
  beforeEach(async () => {
    repository = new FakeRepository();
    await request(build(repository)).post('/auth/register').send(validRegistration);
  });
  const refreshToken = 'r'.repeat(40);

  it('rotates the refresh token and returns a new session', async () => {
    const response = await request(build(repository)).post('/auth/refresh').send({ refreshToken });
    expect(response.status).toBe(200);
    const body = response.body as { refreshToken: string };
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it('answers 401 REFRESH_TOKEN_REUSED when the database detects a reused token', async () => {
    repository.rotation = { outcome: 'ReuseDetected', idUser: 1 };
    const response = await request(build(repository)).post('/auth/refresh').send({ refreshToken });
    expect(response.status).toBe(401);
    expect(errorCodeOf(response)).toBe('REFRESH_TOKEN_REUSED');
  });

  it.each<RotateOutcome>(['NotFound', 'Expired', 'UserInactive'])(
    'answers 401 REFRESH_TOKEN_INVALID for %s',
    async (outcome) => {
      repository.rotation = { outcome, idUser: null };
      const response = await request(build(repository))
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(response.status).toBe(401);
      expect(errorCodeOf(response)).toBe('REFRESH_TOKEN_INVALID');
    },
  );

  it('logs out by revoking the family of the token, answering 204', async () => {
    const response = await request(build(repository)).post('/auth/logout').send({ refreshToken });
    expect(response.status).toBe(204);
    expect(repository.revoked).toEqual([tokens.hashRefresh(refreshToken)]);
  });

  it('returns the own profile only to a signed-in user and always from the token', async () => {
    const app = build(repository);
    expect((await request(app).get('/auth/me')).status).toBe(401);
    const access = await tokens.signAccess({ idUser: 1, role: 'Customer' });
    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${access}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      idUser: 1,
      email: 'ana@shopcart.test',
      role: 'Customer',
    });
    const ghost = await tokens.signAccess({ idUser: 99, role: 'Customer' });
    expect(
      (await request(app).get('/auth/me').set('Authorization', `Bearer ${ghost}`)).status,
    ).toBe(404);
  });
});

describe('refresh token cookie (ADR-0026)', () => {
  let repository: FakeRepository;
  const refreshToken = 'r'.repeat(40);
  const otherToken = 's'.repeat(40);
  const cookieOf = (response: { headers: Record<string, unknown> }): string[] =>
    (response.headers['set-cookie'] as string[] | undefined) ?? [];

  beforeEach(async () => {
    repository = new FakeRepository();
    await request(build(repository)).post('/auth/register').send(validRegistration);
  });

  it('sets the cookie on login with the attributes that keep scripts and other sites out', async () => {
    const response = await request(build(repository))
      .post('/auth/login')
      .send({ email: 'ana@shopcart.test', password: validRegistration.password });
    expect(response.status).toBe(200);
    const [cookie] = cookieOf(response);
    const body = response.body as { refreshToken: string };
    expect(cookie).toContain(`refreshToken=${body.refreshToken}`);
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Secure');
  });

  it('adds Secure when the application is served over https', async () => {
    const response = await request(build(repository, true))
      .post('/auth/login')
      .send({ email: 'ana@shopcart.test', password: validRegistration.password });
    expect(cookieOf(response)[0]).toContain('Secure');
  });

  it('does not set the cookie when the credentials are wrong', async () => {
    const response = await request(build(repository))
      .post('/auth/login')
      .send({ email: 'ana@shopcart.test', password: 'a wrong password' });
    expect(response.status).toBe(401);
    expect(cookieOf(response)).toEqual([]);
  });

  it('renews from the cookie alone and replaces it with the rotated token', async () => {
    const response = await request(build(repository))
      .post('/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);
    expect(response.status).toBe(200);
    expect(repository.rotatedFrom).toEqual([tokens.hashRefresh(refreshToken)]);
    const body = response.body as { refreshToken: string };
    expect(cookieOf(response)[0]).toContain(`refreshToken=${body.refreshToken}`);
  });

  it('prefers a token sent in the body over the ambient cookie, and uses the cookie when there is no body', async () => {
    await request(build(repository))
      .post('/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`)
      .send({ refreshToken: otherToken });
    await request(build(repository))
      .post('/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);
    expect(repository.rotatedFrom).toEqual([
      tokens.hashRefresh(otherToken),
      tokens.hashRefresh(refreshToken),
    ]);
  });

  it('answers 400 when no token comes at all or the token has an impossible shape', async () => {
    const none = await request(build(repository)).post('/auth/refresh');
    expect(none.status).toBe(400);
    const short = await request(build(repository))
      .post('/auth/refresh')
      .send({ refreshToken: 'x' });
    expect(short.status).toBe(400);
    expect(repository.rotatedFrom).toEqual([]);
  });

  it.each<RotateOutcome>(['ReuseDetected', 'NotFound', 'Expired'])(
    'clears the cookie together with the 401 when the outcome is %s',
    async (outcome) => {
      repository.rotation = { outcome, idUser: outcome === 'ReuseDetected' ? 1 : null };
      const response = await request(build(repository))
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`);
      expect(response.status).toBe(401);
      const [cookie] = cookieOf(response);
      expect(cookie).toContain('refreshToken=;');
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
      expect(cookie).toContain('Path=/api/v1/auth');
    },
  );

  it('logs out from the cookie, revokes the family and clears the cookie', async () => {
    const response = await request(build(repository))
      .post('/auth/logout')
      .set('Cookie', `refreshToken=${refreshToken}`);
    expect(response.status).toBe(204);
    expect(repository.revoked).toEqual([tokens.hashRefresh(refreshToken)]);
    expect(cookieOf(response)[0]).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('logs out without any token as a no-op that still clears the cookie', async () => {
    const response = await request(build(repository)).post('/auth/logout');
    expect(response.status).toBe(204);
    expect(repository.revoked).toEqual([]);
    expect(cookieOf(response)[0]).toContain('Expires=Thu, 01 Jan 1970');
  });
});

describe('guest accounts', () => {
  let repository: FakeRepository;
  beforeEach(() => {
    repository = new FakeRepository();
  });

  const startGuest = async (app: express.Express) => {
    const response = await request(app).post('/auth/guest');
    return {
      response,
      token: (response.body as { accessToken: string }).accessToken,
    };
  };

  it('opens a guest session with its own refresh cookie and no email of its own', async () => {
    const response = await request(build(repository)).post('/auth/guest');
    expect(response.status).toBe(201);
    const body = response.body as {
      accessToken: string;
      refreshToken: string;
      user: { isGuest: boolean; role: string; email: string };
    };
    expect(body.user.isGuest).toBe(true);
    expect(body.user.role).toBe('Customer');
    expect(body.user.email).toMatch(/@guest\.invalid$/);
    expect(body.accessToken.split('.')).toHaveLength(3);
    // El refresh token viaja en la cookie HttpOnly y su hash queda guardado, no el token
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain(`refreshToken=${body.refreshToken}`);
    expect(cookie).toContain('HttpOnly');
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.tokenHash).not.toBe(body.refreshToken);
  });

  it('saves the contact data of the guest with a normalised email and a null phone when none is given', async () => {
    const app = build(repository);
    const { token } = await startGuest(app);
    const response = await request(app)
      .put('/auth/guest/contact')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: ' Maria@Example.TEST ', fullName: ' Maria ' });
    expect(response.status).toBe(200);
    expect(repository.users[0]).toMatchObject({
      email: 'maria@example.test',
      fullName: 'Maria',
      phone: null,
    });
  });

  it('refuses the email of a registered account with its own code', async () => {
    await request(build(repository)).post('/auth/register').send(validRegistration);
    const app = build(repository);
    const { token } = await startGuest(app);
    const response = await request(app)
      .put('/auth/guest/contact')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'ana@shopcart.test', fullName: 'Impostor' });
    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('EMAIL_BELONGS_TO_ACCOUNT');
  });

  it('refuses a contact without a valid email, and asks to be signed in', async () => {
    const app = build(repository);
    const { token } = await startGuest(app);
    const invalid = await request(app)
      .put('/auth/guest/contact')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email', fullName: 'Maria' });
    expect(invalid.status).toBe(400);
    const anonymous = await request(app)
      .put('/auth/guest/contact')
      .send({ email: 'maria@example.test', fullName: 'Maria' });
    expect(anonymous.status).toBe(401);
  });
});
