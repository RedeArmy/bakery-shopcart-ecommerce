import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const REQUEST_ID_HEADER = 'X-Request-Id';
// Solo se acepta un identificador entrante con forma segura; cualquier otro se reemplaza
const SAFE_REQUEST_ID = /^[\w-]{8,64}$/;

/** Asigna un requestId a cada petición para correlacionar logs, errores y la bitácora. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.locals['requestId'] = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};
