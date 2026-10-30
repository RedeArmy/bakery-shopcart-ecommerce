const PARTS = 3;

/** Convierte "1.2.0" en [1, 2, 0]; devuelve undefined si no es una versión x.y.z. */
export function parseVersion(version: string): [number, number, number] | undefined {
  const pieces = version.split('.');
  if (pieces.length !== PARTS) return undefined;
  const numbers = pieces.map((piece) => (/^\d{1,6}$/.test(piece) ? Number(piece) : Number.NaN));
  const [major, minor, patch] = numbers;
  if (major === undefined || minor === undefined || patch === undefined) return undefined;
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) return undefined;
  return [major, minor, patch];
}

/** Negativo si a < b, cero si son iguales y positivo si a > b. Ambas deben ser versiones válidas. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === undefined || right === undefined) {
    throw new Error(`Invalid version: "${left === undefined ? a : b}"`);
  }
  for (let index = 0; index < PARTS; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
