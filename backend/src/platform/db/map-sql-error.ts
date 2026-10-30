import { AppError } from '../../shared-kernel/index.js';

const DEADLOCK_ERROR_NUMBER = 1205;

// "CODIGO_ESTABLE: mensaje": solo mayúsculas, dígitos y guiones bajos antes de los dos puntos
const STABLE_CODE = /^([A-Z][A-Z0-9_]{2,}): (.*)$/s;

// Códigos de THROW de los procedimientos almacenados (>= 50000) y su estado HTTP
const BUSINESS_ERRORS: Readonly<Record<number, { httpStatus: number; code: string }>> = {
  50400: { httpStatus: 400, code: 'INVALID_PARAMETER' },
  50404: { httpStatus: 404, code: 'NOT_FOUND' },
  50409: { httpStatus: 409, code: 'CONFLICT' },
  50422: { httpStatus: 422, code: 'BUSINESS_RULE_VIOLATION' },
};

export function isDeadlock(error: unknown): boolean {
  return getErrorNumber(error) === DEADLOCK_ERROR_NUMBER;
}

function getErrorNumber(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { number?: unknown };
  return typeof candidate.number === 'number' ? candidate.number : undefined;
}

/** Traduce un error de SQL Server a un AppError; los errores desconocidos se tratan como fallos internos. */
export function mapSqlError(error: unknown): AppError {
  const number = getErrorNumber(error);
  const mapped = number === undefined ? undefined : BUSINESS_ERRORS[number];
  if (mapped !== undefined) {
    const message = error instanceof Error ? error.message : mapped.code;
    // Los procedimientos anteponen el código estable de la API al mensaje (COUPON_EXPIRED: ...); si lo traen, ese es el código
    const prefixed = STABLE_CODE.exec(message);
    if (prefixed?.[1] !== undefined) {
      return new AppError(mapped.httpStatus, prefixed[1], prefixed[2] ?? message);
    }
    return new AppError(mapped.httpStatus, mapped.code, message);
  }
  return new AppError(500, 'DATABASE_ERROR', 'Unexpected database error');
}
