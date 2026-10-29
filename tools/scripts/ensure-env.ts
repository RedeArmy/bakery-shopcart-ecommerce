// Crea .env a partir de .env.example y genera los secretos locales vacíos.
// Así "npm run up" funciona en una máquina limpia sin pasos manuales y sin versionar secretos.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const EXAMPLE_PATH = '.env.example';
const ENV_PATH = '.env';
const GENERATED_KEYS = [
  'MSSQL_SA_PASSWORD',
  'DB_APP_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_PEPPER',
];

// Solo alfanuméricos con mayúsculas, minúsculas y dígitos: cumple la complejidad de SQL Server
// y evita caracteres que compose o sqlcmd interpretarían (por ejemplo "$").
function generateSecret(): string {
  return `Sc${randomBytes(18).toString('base64url').replace(/[-_]/g, 'x')}9a`;
}

if (existsSync(ENV_PATH)) {
  // cspell:disable-next-line
  console.log('.env ya existe: no se modifica.');
} else {
  const lines = readFileSync(EXAMPLE_PATH, 'utf8').split('\n');
  const filled = lines.map((line) => {
    const [key] = line.split('=');
    return key !== undefined && GENERATED_KEYS.includes(key) && line === `${key}=`
      ? `${key}=${generateSecret()}`
      : line;
  });
  writeFileSync(ENV_PATH, filled.join('\n'));
  // cspell:disable-next-line
  console.log('.env creado con secretos locales generados.');
}
