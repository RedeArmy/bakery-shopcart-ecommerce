import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

/** Puerto del almacenamiento de archivos privados (comprobantes): el disco hoy, otro adaptador mañana (ADR-0018). */
export interface FileStoragePort {
  save(key: string, data: Buffer): Promise<void>;
  open(key: string): Readable;
  remove(key: string): Promise<void>;
}

// Solo claves con forma de UUID: el nombre que elige el cliente jamás forma parte de una ruta del disco
const STORAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createLocalDiskStorage(directory: string): FileStoragePort {
  const pathOf = (key: string): string => {
    if (!STORAGE_KEY.test(key)) throw new TypeError('Invalid storage key');
    return join(directory, key);
  };
  return {
    async save(key, data) {
      const path = pathOf(key);
      await mkdir(directory, { recursive: true });
      // wx: nunca sobrescribe un archivo existente
      await writeFile(path, data, { flag: 'wx', mode: 0o600 });
    },
    open: (key) => createReadStream(pathOf(key)),
    // force: borrar lo que no existe no es un error (compensación tras un fallo de la base de datos)
    remove: (key) => rm(pathOf(key), { force: true }),
  };
}
