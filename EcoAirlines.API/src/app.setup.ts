import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createAccessLogMiddleware, isAccessLogEnabled } from './middleware/access-log.middleware.js';
import { requestIdMiddleware } from './middleware/request-context.js';
import { ProblemDetailsFilter } from './middleware/problem-details.filter.js';
import { applyHttpSecurity } from './security/http-security.js';
import { SanitizeInputPipe } from './security/sanitize-input.pipe.js';
import { loadSecurityConfig, type SecurityConfig } from './security/security.config.js';
import { validationExceptionFactory } from './middleware/validation-exception.factory.js';
import { DOCS_PATH } from './docs/swagger.setup.js';
import { createHttpMetricsMiddleware } from './observability/http-metrics.middleware.js';
import { HttpMetricsStore } from './observability/http-metrics.store.js';

/**
 * Configuración global compartida por main.ts y las pruebas e2e, para que las pruebas
 * ejerciten exactamente la misma cadena de seguridad que la aplicación real.
 */
export function configureApp(app: NestExpressApplication, config: SecurityConfig = loadSecurityConfig()): void {
  // Primero la correlación y el log de acceso, para que incluso las respuestas cortadas antes de
  // llegar a Nest (CORS, body inválido) lleven X-Request-Id y queden registradas.
  app.use(requestIdMiddleware);
  if (isAccessLogEnabled()) {
    app.use(createAccessLogMiddleware());
  }
  // Métricas para el panel de observabilidad del administrador (GET /admin/observability).
  app.use(createHttpMetricsMiddleware(app.get(HttpMetricsStore)));

  applyHttpSecurity(app, config, { docsPath: DOCS_PATH });

  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new SanitizeInputPipe(),
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
}
