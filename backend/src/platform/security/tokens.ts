import { createHmac, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Clock } from '../../shared-kernel/index.js';

export type RoleName = 'Customer' | 'Operator' | 'Administrator';

export interface AccessClaims {
  idUser: number;
  role: RoleName;
}

export interface TokenConfig {
  accessSecret: string;
  refreshPepper: string;
  accessMinutes: number;
  refreshDays: number;
}

export interface RefreshToken {
  /** Valor opaco que recibe el cliente; no se guarda en ningún lado */
  token: string;
  /** Lo único que se guarda: el HMAC-SHA256 del token con el pepper, en hexadecimal */
  hash: string;
  expiresAt: Date;
}

const ISSUER = 'shopcart';
const ROLES: ReadonlySet<string> = new Set(['Customer', 'Operator', 'Administrator']);

/**
 * Emite y verifica los tokens. El access token es un JWT HS256 de vida corta; el de refresco es opaco, de 48 bytes
 * aleatorios, y la base de datos solo conoce su hash para que un volcado de la tabla no sirva para iniciar sesión.
 */
export function createTokenService(config: TokenConfig, clock: Clock) {
  const key = new TextEncoder().encode(config.accessSecret);
  const hashRefresh = (token: string): string =>
    createHmac('sha256', config.refreshPepper).update(token).digest('hex');

  return {
    async signAccess(claims: AccessClaims): Promise<string> {
      const issuedAt = Math.floor(clock.now().getTime() / 1000);
      return new SignJWT({ role: claims.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(String(claims.idUser))
        .setIssuer(ISSUER)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + config.accessMinutes * 60)
        .sign(key);
    },

    /** Devuelve null ante cualquier token inválido, vencido o de otro algoritmo: el llamador responde 401 sin distinguir */
    async verifyAccess(token: string): Promise<AccessClaims | null> {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: ISSUER,
          currentDate: clock.now(),
        });
        const idUser = Number(payload.sub);
        const role = payload['role'];
        if (!Number.isInteger(idUser) || typeof role !== 'string' || !ROLES.has(role)) {
          return null;
        }
        return { idUser, role: role as RoleName };
      } catch {
        return null;
      }
    },

    newRefreshToken(): RefreshToken {
      const token = randomBytes(48).toString('base64url');
      const expiresAt = new Date(clock.now().getTime() + config.refreshDays * 24 * 3600 * 1000);
      return { token, hash: hashRefresh(token), expiresAt };
    },

    hashRefresh,
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
