import { Logger, type LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { getRequestId } from './request-context.js';

export interface AccessLogEntry {
  requestId?: string;
  method: string;
  /** Solo el path: el query string puede contener datos de búsqueda (p. ej. `pnr`) y no se registra. */
  path: string;
  status: number;
  durationMs: number;
  ip?: string;
  /** `sub` del JWT si la petición se autenticó. Es un identificador, no una credencial. */
  sub?: string;
}

/** HTTP_ACCESS_LOG=true|false. Por defecto activo, salvo en pruebas (NODE_ENV=test) para no ensuciar la salida. */
export function isAccessLogEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HTTP_ACCESS_LOG !== undefined) {
    return env.HTTP_ACCESS_LOG === 'true';
  }
  return env.NODE_ENV !== 'test';
}

/**
 * Log de acceso estructurado (una línea JSON por petición). Por diseño NO registra headers
 * (Authorization, Idempotency-Key), bodies (documentos, contacto, `paymentReference`, `secret`)
 * ni query strings.
 */
export function createAccessLogMiddleware(logger: LoggerService = new Logger('HTTP')) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const entry: AccessLogEntry = {
        requestId: getRequestId(req),
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? req.originalUrl,
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
        ip: req.ip,
        sub: (req as Request & { user?: AuthenticatedUser }).user?.sub,
      };
      const line = JSON.stringify(entry);
      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else logger.log(line);
    });

    next();
  };
}
