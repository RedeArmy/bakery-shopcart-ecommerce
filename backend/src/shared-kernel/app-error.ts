/**
 * Error de negocio o de infraestructura con un código estable en inglés británico.
 * El frontend traduce `code` a texto en español; `message` es solo para desarrolladores.
 */
export class AppError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
