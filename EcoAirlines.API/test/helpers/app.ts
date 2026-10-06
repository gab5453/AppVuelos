import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';

/**
 * Crea la aplicación con la misma configuración global que main.ts (seguridad HTTP, CORS,
 * saneamiento, validación y ProblemDetails). `beforeInit` permite registrar rutas extra (Swagger).
 */
export async function createTestApp(beforeInit?: (app: NestExpressApplication) => void): Promise<NestExpressApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  beforeInit?.(app);
  await app.init();
  return app;
}
