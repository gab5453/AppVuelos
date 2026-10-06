import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { getRequestId } from '../middleware/request-context.js';
import type { ProblemDetailsBody } from '@ecoairlines/business/exceptions/problem-details.types.js';
import type { SecurityConfig } from './security.config.js';

/** Headers que el frontend necesita enviar: los de seguridad y los obligatorios del contrato. */
export const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Idempotency-Key',
  'X-Device-Fingerprint',
  'X-Request-Id',
];
/** Headers de respuesta que el navegador puede leer (Retry-After lo documenta el contrato en 409/429). */
export const CORS_EXPOSED_HEADERS = ['Retry-After', 'X-Request-Id'];

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

export interface HttpSecurityOptions {
  /** Ruta de Swagger UI, que necesita una CSP menos restrictiva que la API JSON. */
  docsPath: string;
}

/**
 * Endurecimiento HTTP. Debe aplicarse antes de `app.init()` / `app.listen()` para que los
 * middlewares queden por delante de las rutas.
 */
export function applyHttpSecurity(
  app: NestExpressApplication,
  config: SecurityConfig,
  options: HttpSecurityOptions,
): void {
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(securityHeaders(config, options.docsPath));

  app.enableCors({
    // Peticiones sin Origin (curl, servidor a servidor) no son CORS y se dejan pasar.
    origin: (origin, callback) => callback(null, !origin || config.corsOrigins.includes(origin)),
    // PUT: extensiones fuera del contrato (perfil, cambio de asiento, estado de vuelo del administrador).
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    credentials: false,
    maxAge: 600,
  });

  app.use(requireJsonContentType);
  app.useBodyParser('json', { limit: config.bodyLimit });
  app.use(earlyErrorHandler);
}

function securityHeaders(config: SecurityConfig, docsPath: string) {
  const hsts = config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false;

  // La API solo devuelve JSON: no necesita cargar ningún recurso ni ser embebida.
  const apiHelmet = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    strictTransportSecurity: hsts,
  });

  // Swagger UI carga sus scripts, estilos e imágenes desde el mismo origen.
  // En local (http) no se fuerza upgrade-insecure-requests, que rompería la carga.
  const docsHelmet = helmet({
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: config.isProduction ? [] : null },
    },
    strictTransportSecurity: hsts,
  });

  return (req: Request, res: Response, next: NextFunction) =>
    (req.path === docsPath || req.path.startsWith(`${docsPath}/`) ? docsHelmet : apiHelmet)(req, res, next);
}

/** Todos los request bodies del contrato son `application/json`. */
function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (METHODS_WITH_BODY.has(req.method) && hasBody && !req.is('application/json')) {
    sendProblem(res, 'El body debe enviarse como application/json.', 'Content-Type', 'must be application/json');
    return;
  }
  next();
}

/**
 * Errores de los middlewares de Express (parser JSON y anteriores). Ocurren antes de llegar a Nest,
 * por lo que el ProblemDetailsFilter no los ve; se responden aquí con el mismo formato. Sin este
 * manejador, Express respondería con su página HTML por defecto, que fuera de producción incluye el stack.
 */
function earlyErrorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const { type, status } = (error ?? {}) as { type?: string; status?: number };
  if (type === 'entity.too.large') {
    sendProblem(res, 'El body excede el tamaño máximo permitido.', 'body', 'payload too large');
    return;
  }
  if (type === 'entity.parse.failed') {
    sendProblem(res, 'El body no es un JSON válido.', 'body', 'malformed JSON');
    return;
  }
  if (status !== undefined && status >= 400 && status < 500) {
    sendProblem(res, 'La petición no pudo procesarse.', 'body', type ?? 'invalid request');
    return;
  }

  new Logger('HttpSecurity').error(
    `[requestId=${getRequestId(req) ?? '-'}] ${req.method} ${req.path} → ${error instanceof Error ? error.stack : String(error)}`,
  );
  const body: ProblemDetailsBody = {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    code: 'VALIDATION_FAILED',
  };
  res.status(500).contentType('application/problem+json').json(body);
}

function sendProblem(res: Response, title: string, name: string, reason: string): void {
  const body: ProblemDetailsBody = {
    type: 'about:blank',
    title,
    status: 400,
    code: 'VALIDATION_FAILED',
    invalidParams: [{ name, reason }],
  };
  res.status(400).contentType('application/problem+json').json(body);
}
