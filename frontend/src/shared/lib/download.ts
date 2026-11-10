/**
 * Entrega un archivo ya recibido al navegador para que lo guarde: un enlace temporal al contenido y un clic. El enlace se libera
 * enseguida; el navegador ya tomó el archivo.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** El nombre que propone el servidor en `Content-Disposition: attachment; filename="…"`, o el de respaldo si no lo trae. */
export function filenameOf(disposition: string | null, fallback: string): string {
  const name = /filename="([^"]+)"/.exec(disposition ?? '')?.[1];
  return name ?? fallback;
}
