// Crea .env a partir de .env.example y genera los secretos locales vacíos.
// Así "npm run up" funciona en una máquina limpia sin pasos manuales y sin versionar secretos.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { completeEnv } from './lib/env-file.js';

const EXAMPLE_PATH = '.env.example';
const ENV_PATH = '.env';

const example = readFileSync(EXAMPLE_PATH, 'utf8');
const exists = existsSync(ENV_PATH);
const { content, filled } = completeEnv(
  example,
  exists ? readFileSync(ENV_PATH, 'utf8') : undefined,
);

// cspell:disable
if (!exists) {
  writeFileSync(ENV_PATH, content);
  console.log('.env creado con secretos locales generados.');
} else if (filled.length > 0) {
  writeFileSync(ENV_PATH, content);
  console.log(
    `.env ya existía: se completaron ${filled.join(', ')}. No se cambió ningún otro valor.`,
  );
} else {
  console.log('.env ya existe: no se modifica.');
}
// cspell:enable
