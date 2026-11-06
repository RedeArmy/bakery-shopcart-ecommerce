import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../../../platform/security/passwords.js';
import type { RoleName, TokenService } from '../../../platform/security/tokens.js';
import { AppError, err, ok } from '../../../shared-kernel/index.js';
import type { Clock, Result } from '../../../shared-kernel/index.js';

export interface UserRecord {
  idUser: number;
  role: RoleName;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  /** Cuenta de invitado: compra sin contraseña y sin registrarse (V0013) */
  isGuest: boolean;
}

export interface LoginRecord extends UserRecord {
  passwordHash: string;
  isLocked: boolean;
  lockedUntil: Date | null;
}

export type RotateOutcome = 'Rotated' | 'NotFound' | 'Expired' | 'UserInactive' | 'ReuseDetected';

/** Puerto de acceso a datos de la autenticación; el adaptador SQL llama a SP_Users_* y SP_Tokens_*. */
export interface AuthRepositoryPort {
  register(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone: string | null;
  }): Promise<number>;
  findByEmail(email: string): Promise<LoginRecord | null>;
  findById(idUser: number): Promise<UserRecord | null>;
  recordFailedAttempt(email: string): Promise<void>;
  recordSuccessfulLogin(idUser: number): Promise<void>;
  saveRefreshToken(input: {
    idUser: number;
    idFamily: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  rotateRefreshToken(input: {
    tokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
  }): Promise<{ outcome: RotateOutcome; idUser: number | null }>;
  revokeFamily(tokenHash: string): Promise<void>;
  /** Crea una cuenta de invitado y devuelve su identificador */
  createGuest(): Promise<number>;
  setGuestContact(input: {
    idUser: number;
    email: string;
    fullName: string;
    phone: string | null;
  }): Promise<void>;
  setRecoveryCode(idUser: number, codeHash: string): Promise<void>;
  findGuestsByEmail(email: string): Promise<{ idUser: number; recoveryHash: string }[]>;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Segundos de vida del access token, para que el cliente programe la renovación */
  expiresIn: number;
  user: UserRecord;
}

export interface GuestContactCommand {
  email: string;
  fullName: string;
  phone: string | null;
}

// Sin I, L, O ni U (se confunden con 1, 0 y V al leerlos en voz alta o copiarlos a mano); 10 símbolos son 50 bits
// cspell:disable-next-line
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10;

/** El código se escribe con o sin guiones, espacios y minúsculas: solo cuentan sus símbolos. */
const normaliseCode = (code: string): string => code.toUpperCase().replaceAll(/[^0-9A-Z]/g, '');
const hashCode = (code: string): string =>
  createHash('sha256').update(normaliseCode(code), 'utf8').digest('hex');

export interface RegisterCommand {
  email: string;
  password: string;
  fullName: string;
  phone: string | null;
}

const INVALID_CREDENTIALS = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'The email or the password is incorrect');
const RECOVERY_INVALID = () =>
  new AppError(401, 'RECOVERY_INVALID', 'The email or the recovery code is incorrect');
const REFRESH_INVALID = () =>
  new AppError(401, 'REFRESH_TOKEN_INVALID', 'The refresh token is invalid or expired');

/**
 * Casos de uso de autenticación. Responden con Result: una contraseña incorrecta o una cuenta bloqueada son resultados
 * esperados del negocio, no fallos del sistema.
 */
export class AuthService {
  // Se calcula una vez y sirve para gastar el mismo tiempo cuando el correo no existe (evita enumerar cuentas por latencia)
  private decoyHash: Promise<string> | undefined;

  constructor(
    private readonly repository: AuthRepositoryPort,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly accessMinutes: number,
  ) {}

  async register(command: RegisterCommand): Promise<Result<{ idUser: number }, AppError>> {
    const passwordHash = await this.hasher.hash(command.password);
    try {
      const idUser = await this.repository.register({
        email: command.email,
        passwordHash,
        fullName: command.fullName,
        phone: command.phone,
      });
      return ok({ idUser });
    } catch (error) {
      if (error instanceof AppError && error.httpStatus === 409) {
        return err(
          new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'The email is already registered'),
        );
      }
      throw error;
    }
  }

  async login(email: string, password: string): Promise<Result<Session, AppError>> {
    const account = await this.repository.findByEmail(email);
    if (account === null) {
      this.decoyHash ??= this.hasher.hash('decoy-password-for-timing');
      await this.hasher.verify(await this.decoyHash, password);
      return err(INVALID_CREDENTIALS());
    }
    // Una cuenta bloqueada no prueba contraseñas: cada intento extra solo ayudaría a quien adivina
    if (account.isLocked) {
      return err(
        new AppError(423, 'ACCOUNT_LOCKED', 'The account is temporarily locked', {
          lockedUntil: account.lockedUntil?.toISOString() ?? null,
        }),
      );
    }
    if (!(await this.hasher.verify(account.passwordHash, password))) {
      await this.repository.recordFailedAttempt(email);
      return err(INVALID_CREDENTIALS());
    }
    if (!account.isActive) {
      return err(new AppError(403, 'ACCOUNT_DISABLED', 'The account is disabled'));
    }
    await this.repository.recordSuccessfulLogin(account.idUser);

    const refresh = this.tokens.newRefreshToken();
    await this.repository.saveRefreshToken({
      idUser: account.idUser,
      idFamily: randomUUID(),
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });
    return ok(await this.session(account, refresh.token));
  }

  /** Rota el token: el anterior deja de servir. Reusar uno ya rotado revoca toda la familia (lo hace la base de datos). */
  async refresh(refreshToken: string): Promise<Result<Session, AppError>> {
    const next = this.tokens.newRefreshToken();
    const rotated = await this.repository.rotateRefreshToken({
      tokenHash: this.tokens.hashRefresh(refreshToken),
      newTokenHash: next.hash,
      newExpiresAt: next.expiresAt,
    });
    if (rotated.outcome === 'ReuseDetected') {
      return err(
        new AppError(
          401,
          'REFRESH_TOKEN_REUSED',
          'The refresh token was already used; sign in again',
        ),
      );
    }
    if (rotated.outcome !== 'Rotated' || rotated.idUser === null) return err(REFRESH_INVALID());

    const user = await this.repository.findById(rotated.idUser);
    if (!user?.isActive) return err(REFRESH_INVALID());
    return ok(await this.session(user, next.token));
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repository.revokeFamily(this.tokens.hashRefresh(refreshToken));
  }

  /**
   * Abre la sesión de un invitado: crea la cuenta de invitado y le da una familia de tokens propia, igual que un inicio de
   * sesión. No hay contraseña ni correo todavía; los datos de contacto llegan después, al pedirlos el checkout.
   */
  async startGuest(): Promise<Session> {
    const idUser = await this.repository.createGuest();
    const user = await this.repository.findById(idUser);
    if (user === null) throw new Error('The guest account was not found right after creating it');
    const refresh = this.tokens.newRefreshToken();
    await this.repository.saveRefreshToken({
      idUser,
      idFamily: randomUUID(),
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });
    return this.session(user, refresh.token);
  }

  /** Guarda el nombre, el correo y el teléfono del invitado; la base de datos rechaza los correos de cuentas registradas. */
  async setGuestContact(
    idUser: number,
    contact: GuestContactCommand,
  ): Promise<Result<UserRecord, AppError>> {
    await this.repository.setGuestContact({ idUser, ...contact });
    return this.profile(idUser);
  }

  /**
   * Genera un código nuevo para recuperar los pedidos del invitado. Solo se devuelve aquí y en ningún otro lugar: se guarda
   * su SHA-256 y cada código nuevo reemplaza al anterior.
   */
  async newRecoveryCode(idUser: number): Promise<string> {
    const code = Array.from({ length: CODE_LENGTH }, () =>
      CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length)),
    ).join('');
    await this.repository.setRecoveryCode(idUser, hashCode(code));
    return code;
  }

  /**
   * Devuelve la sesión del invitado que presenta su correo y el código. Cualquier fallo responde lo mismo (correo
   * desconocido, código distinto o ninguno guardado) para no revelar qué correos compraron como invitado.
   */
  async recoverGuest(email: string, code: string): Promise<Result<Session, AppError>> {
    const presented = Buffer.from(hashCode(code), 'hex');
    const candidates = await this.repository.findGuestsByEmail(email);
    // Se compara con todos los candidatos aunque uno ya coincida: el tiempo no dice cuál era
    const matches = candidates.filter((candidate) => {
      const stored = Buffer.from(candidate.recoveryHash, 'hex');
      return stored.length === presented.length && timingSafeEqual(stored, presented);
    });
    const match = matches[0];
    if (match === undefined) return err(RECOVERY_INVALID());

    const user = await this.repository.findById(match.idUser);
    if (!user?.isActive) return err(RECOVERY_INVALID());
    const refresh = this.tokens.newRefreshToken();
    await this.repository.saveRefreshToken({
      idUser: user.idUser,
      idFamily: randomUUID(),
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });
    return ok(await this.session(user, refresh.token));
  }

  async profile(idUser: number): Promise<Result<UserRecord, AppError>> {
    const user = await this.repository.findById(idUser);
    return user === null ? err(new AppError(404, 'NOT_FOUND', 'User not found')) : ok(user);
  }

  private async session(user: UserRecord, refreshToken: string): Promise<Session> {
    const accessToken = await this.tokens.signAccess({ idUser: user.idUser, role: user.role });
    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessMinutes * 60,
      user: {
        idUser: user.idUser,
        role: user.role,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        isActive: user.isActive,
        isGuest: user.isGuest,
      },
    };
  }
}
