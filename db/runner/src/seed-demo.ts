// cspell:ignore Administrador Operador Cliente
// Paso de semilla de las cuentas de demostración (docs/operations/test-accounts.md). Ninguna semilla SQL contiene un usuario,
// una contraseña ni un hash: las contraseñas llegan por el entorno, se transforman aquí y solo el hash entra en la base de datos.
import { hash } from '@node-rs/argon2';
import sql from 'mssql';
import type { SeedConfig } from './config.js';
import { inSequence } from './sequence.js';

export type RoleId = 1 | 2 | 3;

export interface DemoAccount {
  email: string;
  fullName: string;
  /** 1 Customer, 2 Operator, 3 Administrator (S0001) */
  idRole: RoleId;
  /** De qué variable SEED_*_PASSWORD sale su contraseña */
  password: keyof SeedConfig;
}

// El dominio .test está reservado por la RFC 2606: estas direcciones nunca llegan a un buzón real. Los nombres son datos en español.
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'admin@shopcart.test',
    fullName: 'Administrador',
    idRole: 3,
    password: 'adminPassword',
  },
  {
    email: 'operator@shopcart.test',
    fullName: 'Operador',
    idRole: 2,
    password: 'operatorPassword',
  },
  {
    email: 'customer1@shopcart.test',
    fullName: 'Cliente Uno',
    idRole: 1,
    password: 'customerPassword',
  },
  {
    email: 'customer2@shopcart.test',
    fullName: 'Cliente Dos',
    idRole: 1,
    password: 'customerPassword',
  },
];

/** Mismo algoritmo y parámetros por defecto que el backend (argon2id): el login verifica el hash que se guarda aquí. */
export type PasswordHasher = (plain: string) => Promise<string>;
export const argon2idHasher: PasswordHasher = (plain) => hash(plain);

export interface SeededAccount {
  email: string;
  created: boolean;
}

/**
 * Crea las cuentas que falten. Una cuenta que ya existe no se toca (ni su contraseña): rotar las contraseñas exige un
 * volumen nuevo, como dice la guía. Se comprueba antes de calcular el hash, que es lo caro, para que repetir el paso en cada
 * arranque no cueste nada.
 */
export async function seedDemoAccounts(
  pool: sql.ConnectionPool,
  passwords: SeedConfig,
  hasher: PasswordHasher = argon2idHasher,
): Promise<SeededAccount[]> {
  const seeded: SeededAccount[] = [];
  await inSequence(DEMO_ACCOUNTS, async (account) => {
    const existing = await pool
      .request()
      .input('email', sql.NVarChar(256), account.email)
      .query('SELECT 1 AS Found FROM dbo.Users WHERE Email = @email;');
    if (existing.recordset.length > 0) {
      seeded.push({ email: account.email, created: false });
      return;
    }

    const result = await pool
      .request()
      .input('Email', sql.NVarChar(256), account.email)
      .input('PasswordHash', sql.NVarChar(255), await hasher(passwords[account.password]))
      .input('FullName', sql.NVarChar(120), account.fullName)
      .input('IDRole', sql.TinyInt, account.idRole)
      .output('IDUser', sql.Int)
      .output('Created', sql.Bit)
      .execute('dbo.SP_Users_Provision');
    seeded.push({ email: account.email, created: result.output['Created'] === true });
  });
  return seeded;
}
