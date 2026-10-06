import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from '../middleware/request-context.js';
import { UNMATCHED_ROUTE, type HttpMetricsStore } from './http-metrics.store.js';

/**
 * Registra cada respuesta en `HttpMetricsStore`. Usa el patrón de la ruta que resolvió Express
 * (`/bookings/:bookingId`), nunca la URL real, para no guardar ids, PNR ni query strings.
 */
export function createHttpMetricsMiddleware(store: HttpMetricsStore) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const routePath = (req.route as { path?: unknown } | undefined)?.path;
      store.record({
        method: req.method,
        route: typeof routePath === 'string' ? `${req.baseUrl}${routePath}` : UNMATCHED_ROUTE,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        requestId: getRequestId(req),
        at: new Date(),
      });
    });
    next();
  };
}
