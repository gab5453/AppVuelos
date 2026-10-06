import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response } from 'express';
import { load } from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

/**
 * Ruta del contrato. Desde EcoAirlines.API/src/docs y EcoAirlines.API/dist/docs se sube tres niveles hasta
 * la raíz de la solución, donde está `contract/`.
 */
export const CONTRACT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
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

/**
 * Anexo con los endpoints PROPIOS de EcoAirlines (fuera del contrato): perfil, cambio de asiento y administración.
 * Se publica aparte para que `/docs/openapi.json` siga siendo exactamente el contrato.
 */
export const EXTENSIONS_PATH = resolve(dirname(CONTRACT_PATH), 'ecoairlines-extensions.yaml');
export const DOCS_EXTENSIONS_JSON_PATH = `${DOCS_PATH}/extensions.json`;

/**
 * Lee el anexo de extensiones y le agrega, solo en memoria, los schemas y responses del contrato que referencia
 * (`PassengerItem`, `BookingDetail`, `FlightStatus`, `ProblemDetails404`...). Ningún archivo se modifica.
 */
export function loadExtensions(path = EXTENSIONS_PATH, contract = loadContract()): OpenApiDocument {
  const extensions = load(readFileSync(path, 'utf8')) as OpenApiDocument;
  const own = extensions.components ?? {};
  const merged = (name: 'schemas' | 'responses') => {
    const contractEntries = (contract.components?.[name] ?? {}) as Record<string, unknown>;
    const ownEntries = (own[name] ?? {}) as Record<string, unknown>;
    const collisions = Object.keys(ownEntries).filter((key) => key in contractEntries);
    if (collisions.length) throw new Error(`El anexo redefine ${name} del contrato: ${collisions.join(', ')}`);
    return { ...contractEntries, ...ownEntries };
  };
  return { ...extensions, components: { ...own, schemas: merged('schemas'), responses: merged('responses') } };
}

/**
 * Publica Swagger UI en /docs con dos documentos: el contrato (`/docs/openapi.json`, sin cambios) y las
 * extensiones propias (`/docs/extensions.json`), elegibles en el selector de la parte superior.
 */
export function setupSwagger(app: INestApplication, options: SwaggerOptions): OpenApiDocument {
  const contract = loadContract();
  const document = options.devOverlay ? applyDevOverlay(contract, options.localServerUrl) : contract;
  const extensions = loadExtensions(EXTENSIONS_PATH, contract);
  if (options.devOverlay) {
    extensions.servers = [
      { url: options.localServerUrl, description: 'Local (desarrollo)' },
      ...(extensions.servers ?? []),
    ];
  }

  const http = app.getHttpAdapter();
  http.get(DOCS_JSON_PATH, (_req: Request, res: Response) => {
    res.json(document);
  });
  http.get(DOCS_EXTENSIONS_JSON_PATH, (_req: Request, res: Response) => {
    res.json(extensions);
  });
  app.use(
    DOCS_PATH,
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: 'EcoAirlines API — Contrato y extensiones',
      explorer: true,
      swaggerOptions: {
        urls: [
          { url: DOCS_JSON_PATH, name: 'Contrato GDS Flight Core API (vuelos-openapi.yaml)' },
          { url: DOCS_EXTENSIONS_JSON_PATH, name: 'Extensiones EcoAirlines (fuera del contrato)' },
        ],
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    }),
  );

  return document;
}
