import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Ubicaciones fijas de instalación de git: solo las modifica un administrador.
// No se busca en la variable PATH, porque podría incluir directorios escribibles por cualquier usuario.
const GIT_LOCATIONS: readonly string[] = [
  '/usr/bin/git',
  '/usr/local/bin/git',
  '/opt/homebrew/bin/git',
  String.raw`C:\Program Files\Git\cmd\git.exe`,
  String.raw`C:\Program Files (x86)\Git\cmd\git.exe`,
];

/** Devuelve la ruta absoluta del ejecutable de git; falla con un mensaje claro si no está instalado. */
export function resolveGit(exists: (path: string) => boolean = existsSync): string {
  const found = GIT_LOCATIONS.find((location) => exists(location));
  if (found === undefined) {
    throw new Error(`git was not found in any fixed location: ${GIT_LOCATIONS.join(', ')}`);
  }
  return found;
}

/** Lista los archivos versionados y los nuevos que no están ignorados, con rutas relativas y "/". */
export function listRepositoryFiles(): string[] {
  const output = execFileSync(resolveGit(), ['ls-files', '-co', '--exclude-standard'], {
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((file) => file.trim())
    .filter((file) => file.length > 0);
}
