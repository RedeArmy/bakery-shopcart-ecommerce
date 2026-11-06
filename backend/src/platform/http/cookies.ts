import type { Request } from 'express';

/**
 * Valor de una cookie del encabezado `Cookie`, o `undefined` si no viene. Express no analiza cookies por sí solo y una
 * dependencia entera sobra para leer una: se toma el primer par con ese nombre y se descartan los valores mal codificados.
 */
export function readCookie(req: Pick<Request, 'headers'>, name: string): string | undefined {
  const header = req.headers.cookie;
  if (header === undefined) return undefined;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1 || pair.slice(0, separator).trim() !== name) continue;
    const raw = pair.slice(separator + 1).trim();
    const unquoted =
      raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    try {
      return decodeURIComponent(unquoted);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
