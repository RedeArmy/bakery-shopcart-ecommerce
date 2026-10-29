import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../logging/logger.js';
import { AppError } from '../../shared-kernel/index.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId: string };
}

const requestIdOf = (locals: Record<string, unknown>): string =>
  typeof locals['requestId'] === 'string' ? locals['requestId'] : 'unknown';

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = {
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.path} does not exist`,
      requestId: requestIdOf(res.locals),
    },
  };
  res.status(404).json(body);
};

/** Formato único de error: { error: { code, message, details, requestId } }. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express identifica los manejadores de error por su aridad de cuatro parámetros
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error: unknown, _req, res, _next) => {
    const requestId = requestIdOf(res.locals);

    if (error instanceof AppError) {
      const body: ErrorBody = {
        error: { code: error.code, message: error.message, details: error.details, requestId },
      };
      res.status(error.httpStatus).json(body);
      return;
    }
    if (error instanceof ZodError) {
      const body: ErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          requestId,
        },
      };
      res.status(400).json(body);
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      const body: ErrorBody = {
        error: { code: 'INVALID_JSON', message: 'Malformed JSON body', requestId },
      };
      res.status(400).json(body);
      return;
    }

    // Un error inesperado nunca expone su detalle al cliente: solo se registra con el requestId
    logger.error({ err: error, requestId }, 'Unhandled error');
    const body: ErrorBody = {
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error', requestId },
    };
    res.status(500).json(body);
  };
}
