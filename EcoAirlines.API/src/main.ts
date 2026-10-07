import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadSecurityConfig } from './security/security.config.js';
import { validateEnvironment } from './config/validate-environment.js';
import { isSwaggerEnabled, setupSwagger } from './docs/swagger.setup.js';

/**
 * HTTPS opcional en local con HTTPS_KEY_PATH y HTTPS_CERT_PATH. En producción se asume que
 * el TLS termina en el gateway/balanceador (configurar TRUST_PROXY).
 */
function loadHttpsOptions(env: NodeJS.ProcessEnv = process.env) {
  const { HTTPS_KEY_PATH: keyPath, HTTPS_CERT_PATH: certPath } = env;
  return keyPath && certPath ? { key: readFileSync(keyPath), cert: readFileSync(certPath) } : undefined;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const configErrors = validateEnvironment();
  if (configErrors.length > 0) {
    logger.error(`Configuración inválida, la API no arranca:\n - ${configErrors.join('\n - ')}`);
    process.exit(1);
  }

  const httpsOptions = loadHttpsOptions();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { httpsOptions });
  const port = Number(process.env.PORT ?? 3000);

  // Cierra conexiones y libera recursos de los módulos al recibir SIGTERM/SIGINT (despliegues, Ctrl+C).
  app.enableShutdownHooks();
  configureApp(app, loadSecurityConfig());

  if (isSwaggerEnabled()) {
    // En la nube, PUBLIC_API_URL activa el mismo overlay con la URL pública: "Try it out" y Authorize funcionan desde Swagger.
    const publicUrl = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, '') || undefined;
    setupSwagger(app, {
      devOverlay: process.env.NODE_ENV !== 'production' || publicUrl !== undefined,
      localServerUrl: publicUrl ?? `${httpsOptions ? 'https' : 'http'}://localhost:${port}`,
      devAuthUrl: process.env.DEV_AUTH_URL?.trim().replace(/\/+$/, '') || undefined,
    });
  }

  await app.listen(port);
  logger.log(`API escuchando en el puerto ${port} (${process.env.NODE_ENV ?? 'development'})`);
}
await bootstrap();
