import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import type { RoleName } from '../../../platform/security/tokens.js';
import type {
  AuthRepositoryPort,
  LoginRecord,
  RotateOutcome,
  UserRecord,
} from '../application/auth-service.js';

interface UserRow {
  IDUser: number;
  RoleName: RoleName;
  Email: string;
  FullName: string;
  Phone: string | null;
  IsActive: boolean;
}

interface LoginRow extends UserRow {
  PasswordHash: string;
  IsLocked: boolean;
  LockedUntil: Date | null;
}

const toUser = (row: UserRow): UserRecord => ({
  idUser: row.IDUser,
  role: row.RoleName,
  email: row.Email,
  fullName: row.FullName,
  phone: row.Phone,
  isActive: row.IsActive,
});

/** Adaptador SQL de la autenticación: no hay SQL en línea, solo llamadas a procedimientos con parámetros tipados. */
export function createSqlAuthRepository(execute: ProcedureExecutor): AuthRepositoryPort {
  return {
    async register(input) {
      const result = await execute(
        'dbo.SP_Users_Register',
        [
          { name: 'Email', type: sql.NVarChar(256), value: input.email },
          { name: 'PasswordHash', type: sql.NVarChar(255), value: input.passwordHash },
          { name: 'FullName', type: sql.NVarChar(120), value: input.fullName },
          { name: 'Phone', type: sql.NVarChar(20), value: input.phone },
        ],
        [{ name: 'IDUser', type: sql.Int }],
      );
      return result.output['IDUser'] as number;
    },

    async findByEmail(email): Promise<LoginRecord | null> {
      const result = await execute<LoginRow>('dbo.SP_Users_GetByEmail', [
        { name: 'Email', type: sql.NVarChar(256), value: email },
      ]);
      const row = result.rows[0];
      if (row === undefined) return null;
      return {
        ...toUser(row),
        passwordHash: row.PasswordHash,
        isLocked: row.IsLocked,
        lockedUntil: row.LockedUntil,
      };
    },

    async findById(idUser) {
      const result = await execute<UserRow>('dbo.SP_Users_GetById', [
        { name: 'IDUser', type: sql.Int, value: idUser },
      ]);
      const row = result.rows[0];
      return row === undefined ? null : toUser(row);
    },

    async recordFailedAttempt(email) {
      await execute('dbo.SP_Users_RecordFailedAttempt', [
        { name: 'Email', type: sql.NVarChar(256), value: email },
      ]);
    },

    async recordSuccessfulLogin(idUser) {
      await execute('dbo.SP_Users_RecordSuccessfulLogin', [
        { name: 'IDUser', type: sql.Int, value: idUser },
      ]);
    },

    async saveRefreshToken(input) {
      await execute(
        'dbo.SP_Tokens_Save',
        [
          { name: 'IDUser', type: sql.Int, value: input.idUser },
          { name: 'IDFamily', type: sql.UniqueIdentifier, value: input.idFamily },
          { name: 'TokenHash', type: sql.Char(64), value: input.tokenHash },
          { name: 'ExpiresAt', type: sql.DateTime2(3), value: input.expiresAt },
        ],
        [{ name: 'IDRefreshToken', type: sql.BigInt }],
      );
    },

    async rotateRefreshToken(input) {
      const result = await execute(
        'dbo.SP_Tokens_Rotate',
        [
          { name: 'TokenHash', type: sql.Char(64), value: input.tokenHash },
          { name: 'NewTokenHash', type: sql.Char(64), value: input.newTokenHash },
          { name: 'NewExpiresAt', type: sql.DateTime2(3), value: input.newExpiresAt },
        ],
        [
          { name: 'Outcome', type: sql.VarChar(20) },
          { name: 'IDUser', type: sql.Int },
          { name: 'IDFamily', type: sql.UniqueIdentifier },
          { name: 'IDRefreshToken', type: sql.BigInt },
        ],
      );
      return {
        outcome: result.output['Outcome'] as RotateOutcome,
        idUser: (result.output['IDUser'] as number | null | undefined) ?? null,
      };
    },

    async revokeFamily(tokenHash) {
      await execute(
        'dbo.SP_Tokens_RevokeFamily',
        [{ name: 'TokenHash', type: sql.Char(64), value: tokenHash }],
        [{ name: 'RevokedTokens', type: sql.Int }],
      );
    },
  };
}
