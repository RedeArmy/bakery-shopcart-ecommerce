export interface RegisteredFile {
  name: string;
  /** SHA-256 del contenido con fin de línea LF, el mismo que calcula el runner */
  checksum: string;
}

// El checksum debe aparecer justo después del nombre del archivo en su ficha (o en su fila de la tabla de semillas)
const ENTRY_WINDOW = 200;

/**
 * Comprueba que el registro de migraciones (docs/database/migration-register.md) menciona cada migración y cada
 * semilla con su checksum actual. Sin esta comprobación el registro se desactualiza en silencio al editar un archivo.
 */
export function findRegisterProblems(register: string, files: readonly RegisteredFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    // La última mención es la de la ficha: la primera suele ser la tabla resumen, que no lleva checksum
    const position = register.lastIndexOf(file.name);
    if (position === -1) {
      problems.push(`${file.name} has no entry in the migration register`);
    } else if (!register.slice(position, position + ENTRY_WINDOW).includes(file.checksum)) {
      problems.push(
        `${file.name}: the checksum in the migration register does not match the file (expected ${file.checksum})`,
      );
    }
  }
  return problems;
}
