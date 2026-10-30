import { hash, verify } from '@node-rs/argon2';

/** Puerto del hash de contraseñas: las pruebas usan uno rápido y el sistema argon2id. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(stored: string, plain: string): Promise<boolean>;
}

// Parámetros por defecto de la biblioteca (argon2id, 19 MiB, 2 pasadas): cumplen la recomendación de OWASP
export const argon2PasswordHasher: PasswordHasher = {
  hash: (plain) => hash(plain),
  async verify(stored, plain) {
    try {
      return await verify(stored, plain);
    } catch {
      // Un hash almacenado con formato inválido nunca debe dejar entrar: se trata como contraseña incorrecta
      return false;
    }
  },
};
