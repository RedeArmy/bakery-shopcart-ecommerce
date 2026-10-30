/**
 * Separa un script en lotes con el separador GO de sqlcmd (una línea completa).
 * Algunas sentencias, como CREATE PROCEDURE, exigen ser la primera de su lote.
 * Espera texto ya normalizado a LF.
 */
export function splitBatches(script: string): string[] {
  const batches: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    const text = current.join('\n').trim();
    if (text !== '') batches.push(text);
    current = [];
  };

  // Comparación de cadenas en lugar de una expresión regular: evita el retroceso (backtracking) costoso
  for (const line of script.split('\n')) {
    if (line.trim().toUpperCase() === 'GO') flush();
    else current.push(line);
  }
  flush();
  return batches;
}
