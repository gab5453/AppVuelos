import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createAccessLogMiddleware, isAccessLogEnabled } from './common/observability/access-log.middleware.js';
import { requestIdMiddleware } from './common/observability/request-context.js';
import { ProblemDetailsFilter } from './common/problem-details/problem-details.filter.js';
import { applyHttpSecurity } from './common/security/http-security.js';
import { SanitizeInputPipe } from './common/security/sanitize-input.pipe.js';
import { loadSecurityConfig, type SecurityConfig } from './common/security/security.config.js';
import { validationExceptionFactory } from './common/validation/validation-exception.factory.js';
import { DOCS_PATH } from './docs/swagger.setup.js';

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
