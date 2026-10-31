// Completa el archivo .env con los secretos locales. Es una función pura (sin disco ni azar propio) para poder probarla.
import { randomBytes } from 'node:crypto';

/** Variables que "npm run up" genera al azar. Las SEED_* son las contraseñas de las cuentas de prueba (docs/operations/test-accounts.md). */
export const GENERATED_KEYS: readonly string[] = [
  'MSSQL_SA_PASSWORD',
  'DB_APP_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_PEPPER',
  'SEED_ADMIN_PASSWORD',
  'SEED_OPERATOR_PASSWORD',
  'SEED_CUSTOMER_PASSWORD',
];

// Variables con valor fijo que un .env anterior puede no tener y que la semilla necesita para arrancar
const DEFAULT_KEYS: readonly string[] = ['SEED_DEMO_DATA'];

// Solo alfanuméricos con mayúsculas, minúsculas y dígitos: cumple la complejidad de SQL Server y la longitud mínima de
// contraseña de la API (10), y evita caracteres que compose o sqlcmd interpretarían (por ejemplo "$").
export function generateSecret(): string {
  return `Sc${randomBytes(18).toString('base64url').replace(/[-_]/g, 'x')}9a`;
}

export interface EnvCompletion {
  content: string;
  /** Variables a las que se les dio valor, para informarlo sin imprimir el secreto */
  filled: string[];
}

const keyOf = (line: string): string => line.slice(0, Math.max(line.indexOf('='), 0));

/**
 * Sin .env, parte de .env.example y rellena los secretos vacíos. Con un .env que ya existe nunca toca un valor que tenga:
 * solo rellena los secretos que quedaron vacíos y añade al final las variables gestionadas que le faltan, para que un .env
 * de antes de que existieran las contraseñas de prueba funcione sin borrarlo (borrarlo cambiaría también la contraseña de
 * SQL Server y dejaría el volumen existente inaccesible).
 */
export function completeEnv(
  example: string,
  current: string | undefined,
  generate: () => string = generateSecret,
): EnvCompletion {
  const filled: string[] = [];
  const lines = (current ?? example).split('\n');

  const completed = lines.map((line) => {
    const key = keyOf(line);
    if (GENERATED_KEYS.includes(key) && line === `${key}=`) {
      filled.push(key);
      return `${key}=${generate()}`;
    }
    return line;
  });

  if (current !== undefined) {
    const present = new Set(lines.map(keyOf));
    const exampleLines = example.split('\n');
    const missing = [...GENERATED_KEYS, ...DEFAULT_KEYS].filter((key) => !present.has(key));
    const additions = missing.map((key) => {
      filled.push(key);
      if (GENERATED_KEYS.includes(key)) return `${key}=${generate()}`;
      return exampleLines.find((line) => keyOf(line) === key) ?? `${key}=`;
    });
    if (additions.length > 0) {
      // El archivo termina en salto de línea: la última "línea" vacía se conserva al final
      const last = completed.at(-1) === '' ? completed.pop() : undefined;
      completed.push(...additions);
      if (last !== undefined) completed.push(last);
    }
  }

  return { content: completed.join('\n'), filled };
}
