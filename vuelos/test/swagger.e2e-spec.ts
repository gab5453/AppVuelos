import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import {
  DEV_SECURITY_SCHEME,
  DOCS_JSON_PATH,
  DOCS_PATH,
  loadContract,
  setupSwagger,
} from './../src/docs/swagger.setup.js';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];

function createApp(devOverlay: boolean): Promise<NestExpressApplication> {
  return createTestApp((app) => setupSwagger(app, { devOverlay, localServerUrl: 'http://localhost:3000' }));
}

/** Convierte un path de Nest (`bookings/:bookingId`) a la notación del contrato (`/bookings/{bookingId}`). */
function toContractPath(...parts: string[]): string {
  const segments = parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .map((segment) => segment.replace(/^:(.+)$/, '{$1}'));
  return `/${segments.join('/')}`;
}

/** Rutas declaradas por los controllers de Nest, en formato `método path`. */
function registeredRoutes(app: INestApplication): string[] {
  const routes: string[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: unknown[]) => unknown) | null;
      if (!controller) continue;
      const basePath = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
      const prototype = controller.prototype as Record<string, unknown>;

      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (handlerPath === undefined) continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
        routes.push(`${RequestMethod[method].toLowerCase()} ${toContractPath(basePath, handlerPath)}`);
      }
    }
  }
  return routes.sort();
}

function contractRoutes(): string[] {
  const contract = loadContract();
  return Object.entries(contract.paths)
    .flatMap(([path, item]) =>
      Object.keys(item)
        .filter((key) => HTTP_METHODS.includes(key))
        .map((method) => `${method} ${path}`),
    )
    .sort();
}

describe('Swagger / contrato (e2e)', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app.close();
  });

  describe('sin overlay (equivalente a producción con SWAGGER_ENABLED=true)', () => {
    beforeEach(async () => {
      app = await createApp(false);
    });

    it(`GET ${DOCS_JSON_PATH} devuelve exactamente el contrato`, async () => {
      const response = await request(app.getHttpServer()).get(DOCS_JSON_PATH).expect(200);
      expect(response.body).toEqual(JSON.parse(JSON.stringify(loadContract())));
    });
  });

  describe('con overlay de desarrollo', () => {
    beforeEach(async () => {
      app = await createApp(true);
    });

    it(`GET ${DOCS_PATH}/ sirve Swagger UI`, async () => {
      const response = await request(app.getHttpServer()).get(`${DOCS_PATH}/`).expect(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('swagger-ui');
    });

    it('conserva paths, schemas y responses del contrato y solo agrega servidor local y DevBearer', async () => {
      const contract = JSON.parse(JSON.stringify(loadContract()));
      const { body } = await request(app.getHttpServer()).get(DOCS_JSON_PATH).expect(200);

      expect(Object.keys(body.paths)).toEqual(Object.keys(contract.paths));
      expect(body.components.schemas).toEqual(contract.components.schemas);
      expect(body.components.responses).toEqual(contract.components.responses);
      expect(body.components.securitySchemes.OAuth2Security).toEqual(
        contract.components.securitySchemes.OAuth2Security,
      );
      expect(body.components.securitySchemes).toHaveProperty(DEV_SECURITY_SCHEME);
      expect(body.servers.slice(1)).toEqual(contract.servers);
    });
  });

  describe('conformidad de rutas', () => {
    beforeEach(async () => {
      app = await createApp(false);
    });

    it('cada operación del contrato tiene un handler y no hay rutas fuera del contrato', () => {
      expect(registeredRoutes(app)).toEqual(contractRoutes());
    });
  });
});
