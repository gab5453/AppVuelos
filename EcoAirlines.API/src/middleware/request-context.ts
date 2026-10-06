import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { UUID_PATTERN } from '@ecoairlines/business/validation/patterns.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const REQUEST_ID = Symbol('requestId');
type RequestWithId = Request & { [REQUEST_ID]?: string };

/**
 * Asigna un identificador de correlación a cada petición y lo devuelve en `X-Request-Id`.
 * Se respeta el valor del cliente o del gateway solo si es un UUID, para que un valor
 * arbitrario no termine inyectado en los logs. No se agrega al body: ProblemDetails tiene
 * `additionalProperties: false` en el contrato.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && UUID_PATTERN.test(incoming) ? incoming : randomUUID();
  (req as RequestWithId)[REQUEST_ID] = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(req: Request): string | undefined {
  return (req as RequestWithId)[REQUEST_ID];
}
