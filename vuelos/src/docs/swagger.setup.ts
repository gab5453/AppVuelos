import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response } from 'express';
import { load } from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

/** Ruta del contrato. Desde src/docs y dist/docs se sube dos niveles hasta la raíz del proyecto. */
export const CONTRACT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'contract',
  'vuelos-openapi.yaml',
);

export const DOCS_PATH = '/docs';
export const DOCS_JSON_PATH = `${DOCS_PATH}/openapi.json`;
export const DEV_SECURITY_SCHEME = 'DevBearer';

export type OpenApiDocument = Record<string, unknown> & {
  servers?: { url: string; description?: string }[];
  security?: Record<string, string[]>[];
  paths: Record<string, Record<string, { security?: Record<string, string[]>[] }>>;
  components?: { securitySchemes?: Record<string, unknown> } & Record<string, unknown>;
};

export interface SwaggerOptions {
  /** Aplica el overlay de desarrollo (servidor local + DevBearer). Nunca en producción. */
  devOverlay: boolean;
  /** URL del servidor local que se antepone a los `servers` del contrato. */
  localServerUrl: string;
}

/** Lee el contrato en solo lectura. El archivo en disco nunca se modifica. */
export function loadContract(path = CONTRACT_PATH): OpenApiDocument {
  return load(readFileSync(path, 'utf8')) as OpenApiDocument;
}

/**
 * Overlay solo en memoria para poder usar "Try it out" en local:
 * - antepone el servidor local a los `servers` del contrato (se conservan los originales);
 * - agrega el esquema `DevBearer`, porque el flujo OAuth2 del contrato apunta a un authorization
 *   server externo que no existe en desarrollo. Se agrega como alternativa en cada operación
 *   protegida, sin quitar el requisito OAuth2Security ni sus scopes.
 * Devuelve una copia; el documento recibido no se altera.
 */
export function applyDevOverlay(contract: OpenApiDocument, localServerUrl: string): OpenApiDocument {
  const doc = structuredClone(contract);

  doc.servers = [
    { url: localServerUrl, description: 'Local (desarrollo) — agregado por el overlay, no forma parte del contrato' },
    ...(doc.servers ?? []),
  ];

  doc.components ??= {};
  doc.components.securitySchemes = {
    ...doc.components.securitySchemes,
    [DEV_SECURITY_SCHEME]: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'Solo desarrollo. JWT firmado localmente: generar con `npm run token` y pegarlo aquí sin el prefijo "Bearer" ' +
        '(el authorization server del contrato no está disponible en local).',
    },
  };

  const withDevAlternative = (security: Record<string, string[]>[]): Record<string, string[]>[] =>
    security.some((requirement) => 'OAuth2Security' in requirement)
      ? [...security, { [DEV_SECURITY_SCHEME]: [] }]
      : security;

  if (doc.security) {
    doc.security = withDevAlternative(doc.security);
  }
  for (const pathItem of Object.values(doc.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (operation.security) {
        operation.security = withDevAlternative(operation.security);
      }
    }
  }

  return doc;
}

export function isSwaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SWAGGER_ENABLED !== undefined) {
    return env.SWAGGER_ENABLED === 'true';
  }
  return env.NODE_ENV !== 'production';
}

/** Publica Swagger UI en /docs y el documento en /docs/openapi.json. */
export function setupSwagger(app: INestApplication, options: SwaggerOptions): OpenApiDocument {
  const contract = loadContract();
  const document = options.devOverlay ? applyDevOverlay(contract, options.localServerUrl) : contract;

  const http = app.getHttpAdapter();
  http.get(DOCS_JSON_PATH, (_req: Request, res: Response) => {
    res.json(document);
  });
  app.use(
    DOCS_PATH,
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'GDS Flight Core API — Contrato',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
  );

  return document;
}
