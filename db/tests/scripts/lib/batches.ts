/**
 * Separa un script T-SQL en lotes, como hace sqlcmd: el separador GO ocupa una línea completa.
 * Cada lote se envía por separado porque algunas sentencias (CREATE PROCEDURE, por ejemplo)
 * exigen ser la primera de su lote.
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
  for (const line of script.split(/\r?\n/)) {
    if (line.trim().toUpperCase() === 'GO') flush();
    else current.push(line);
  }
  flush();
  return batches;
}
