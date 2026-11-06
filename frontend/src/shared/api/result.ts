/** Error de negocio del API: la forma única `{ error: { code, message, details, requestId } }` ya convertida en objeto. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Código estable en inglés británico; la pantalla lo traduce con `errorMessage` */
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
    /** Segundos que pide esperar el servidor (cabecera Retry-After) */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown; details?: unknown; requestId?: unknown };
}

/** Convierte la respuesta de error de openapi-fetch en un ApiError, aunque el cuerpo no tenga la forma esperada. */
export function toApiError(status: number, body: unknown, headers?: Headers): ApiError {
  const error = (body as ErrorBody | undefined)?.error;
  const retry = Number(headers?.get('Retry-After'));
  return new ApiError(
    status,
    typeof error?.code === 'string' ? error.code : 'UNEXPECTED',
    typeof error?.message === 'string' ? error.message : `HTTP ${status}`,
    error?.details,
    typeof error?.requestId === 'string' ? error.requestId : undefined,
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}

interface ClientResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Devuelve los datos de una llamada del cliente o lanza el ApiError: ninguna vista repite el manejo de `error`. */
export function unwrap<T>(result: ClientResult<T>): T {
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.response.status, result.error, result.response.headers);
  }
  return result.data as T;
}
