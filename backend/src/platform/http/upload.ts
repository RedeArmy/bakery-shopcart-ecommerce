import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../shared-kernel/index.js';

/**
 * Recibe un solo archivo en memoria (como mucho `maxBytes`) del campo indicado. Los errores de multer se traducen a la forma
 * única de error de la API. El tipo real se comprueba después, por los bytes del archivo y no por lo que declare el cliente.
 */
export function createSingleFileUpload(field: string, maxBytes: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10, parts: 12 },
  }).single(field);

  return (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (error === undefined || error === null) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        next(
          error.code === 'LIMIT_FILE_SIZE'
            ? new AppError(413, 'PAYLOAD_TOO_LARGE', `The file exceeds ${maxBytes} bytes`)
            : new AppError(400, 'VALIDATION_ERROR', `Invalid upload: ${error.code}`),
        );
        return;
      }
      next(error);
    });
  };
}
