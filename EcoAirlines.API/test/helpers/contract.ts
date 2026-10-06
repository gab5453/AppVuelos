import { Ajv, type ValidateFunction } from 'ajv';
import formatsModule from 'ajv-formats';
import type { Response } from 'supertest';
import { loadContract, loadExtensions } from '../../src/docs/swagger.setup.js';

/**
 * Valida respuestas reales de la API contra `contract/vuelos-openapi.yaml` (y, para los endpoints propios,
 * contra `contract/ecoairlines-extensions.yaml`):
 * - el status debe estar DOCUMENTADO para esa operación;
 * - el body debe cumplir el schema de esa respuesta (con `$ref`, `nullable`, formatos y `additionalProperties`);
 * - el Content-Type debe coincidir (`application/json` o `application/problem+json`);
 * - una respuesta sin `content` en el contrato no debe tener body.
 */

type Method = 'get' | 'post' | 'put' | 'delete';
type JsonSchema = Record<string, unknown>;

interface ResponseObject {
  $ref?: string;
  content?: Record<string, { schema: JsonSchema }>;
}

interface Operation {
  responses: Record<string, ResponseObject>;
}

interface OpenApi {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, JsonSchema>; responses: Record<string, ResponseObject> };
}

const documents = {
  contract: { label: 'el contrato', document: loadContract() as unknown as OpenApi },
  /** Anexo de extensiones fuera del contrato, ya combinado con los schemas del contrato que referencia. */
  extensions: { label: 'el anexo de extensiones', document: loadExtensions() as unknown as OpenApi },
};
type DocumentId = keyof typeof documents;

// ajv-formats es CommonJS con `export default`: en ESM llega como módulo o como función según el cargador.
const addFormats = ((formatsModule as unknown as { default?: unknown }).default ?? formatsModule) as (ajv: Ajv) => Ajv;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
for (const [id, { document }] of Object.entries(documents)) {
  ajv.addSchema({ $id: id, components: { schemas: document.components.schemas } });
}

const LOCAL_REF = /"#\/components\/schemas\//g;
const validators = new Map<string, ValidateFunction>();

/** Operaciones y status que las pruebas validaron, para medir cobertura del contrato. */
export const coverage = new Set<string>();

function validatorFor(id: DocumentId, key: string, schema: JsonSchema): ValidateFunction {
  const cacheKey = `${id} ${key}`;
  let validator = validators.get(cacheKey);
  if (!validator) {
    // Los schemas en línea referencian `#/components/...` del documento: se reescriben a su id.
    validator = ajv.compile(JSON.parse(JSON.stringify(schema).replace(LOCAL_REF, `"${id}#/components/schemas/`)) as JsonSchema);
    validators.set(cacheKey, validator);
  }
  return validator;
}

function expectDocumented(id: DocumentId, method: Method, path: string, response: Response): void {
  const { label, document } = documents[id];
  const operation = document.paths[path]?.[method];
  if (!operation) throw new Error(`${method.toUpperCase()} ${path} no existe en ${label}`);

  const documented = operation.responses[String(response.status)];
  if (!documented) {
    throw new Error(
      `${method.toUpperCase()} ${path} respondió ${response.status}, que ${label} no documenta ` +
        `(documentados: ${Object.keys(operation.responses).join(', ')}). Body: ${JSON.stringify(response.body)}`,
    );
  }

  const resolved = documented.$ref ? document.components.responses[documented.$ref.split('/').at(-1)!]! : documented;
  const [mediaType, media] = Object.entries(resolved.content ?? {})[0] ?? [];
  if (!mediaType || !media) {
    expect(response.text ?? '').toBe('');
  } else {
    expect(response.headers['content-type']).toContain(mediaType);
    const validate = validatorFor(id, `${method} ${path} ${response.status}`, media.schema);
    if (!validate(response.body)) {
      throw new Error(
        `${method.toUpperCase()} ${path} ${response.status} no cumple el schema de ${label}:\n` +
          `${ajv.errorsText(validate.errors, { separator: '\n' })}\nBody: ${JSON.stringify(response.body).slice(0, 2000)}`,
      );
    }
  }
}

export function expectContract(method: Method, path: string, response: Response): void {
  expectDocumented('contract', method, path, response);
  coverage.add(`${method.toUpperCase()} ${path} ${response.status}`);
}

/** Igual que `expectContract`, contra `contract/ecoairlines-extensions.yaml` (endpoints fuera del contrato). */
export function expectExtension(method: Method, path: string, response: Response): void {
  expectDocumented('extensions', method, path, response);
}

/** Todas las combinaciones operación + status documentadas en el contrato. */
export function documentedResponses(): string[] {
  return Object.entries(documents.contract.document.paths).flatMap(([path, item]) =>
    Object.entries(item).flatMap(([method, operation]) =>
      Object.keys(operation.responses).map((status) => `${method.toUpperCase()} ${path} ${status}`),
    ),
  );
}
