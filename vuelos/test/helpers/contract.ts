import { Ajv, type ValidateFunction } from 'ajv';
import formatsModule from 'ajv-formats';
import type { Response } from 'supertest';
import { loadContract } from '../../src/docs/swagger.setup.js';

/**
 * Valida respuestas reales de la API contra `contract/vuelos-openapi.yaml`:
 * - el status debe estar DOCUMENTADO para esa operación;
 * - el body debe cumplir el schema de esa respuesta (con `$ref`, `nullable`, formatos y `additionalProperties`);
 * - el Content-Type debe coincidir (`application/json` o `application/problem+json`);
 * - una respuesta sin `content` en el contrato no debe tener body.
 */

type Method = 'get' | 'post' | 'delete';
type JsonSchema = Record<string, unknown>;

interface ResponseObject {
  $ref?: string;
  content?: Record<string, { schema: JsonSchema }>;
}

interface Operation {
  responses: Record<string, ResponseObject>;
}

const contract = loadContract() as unknown as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, JsonSchema>; responses: Record<string, ResponseObject> };
};

// ajv-formats es CommonJS con `export default`: en ESM llega como módulo o como función según el cargador.
const addFormats = ((formatsModule as unknown as { default?: unknown }).default ?? formatsModule) as (ajv: Ajv) => Ajv;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', components: { schemas: contract.components.schemas } });

const CONTRACT_REF = /"#\/components\/schemas\//g;
const validators = new Map<string, ValidateFunction>();

/** Operaciones y status que las pruebas validaron, para medir cobertura del contrato. */
export const coverage = new Set<string>();

function resolveResponse(response: ResponseObject): ResponseObject {
  if (!response.$ref) return response;
  const name = response.$ref.split('/').at(-1)!;
  return contract.components.responses[name]!;
}

function validatorFor(key: string, schema: JsonSchema): ValidateFunction {
  let validator = validators.get(key);
  if (!validator) {
    // Los schemas en línea referencian `#/components/...` del documento: se reescriben al id `contract`.
    validator = ajv.compile(JSON.parse(JSON.stringify(schema).replace(CONTRACT_REF, '"contract#/components/schemas/')) as JsonSchema);
    validators.set(key, validator);
  }
  return validator;
}

export function expectContract(method: Method, path: string, response: Response): void {
  const operation = contract.paths[path]?.[method];
  if (!operation) throw new Error(`${method.toUpperCase()} ${path} no existe en el contrato`);

  const documented = operation.responses[String(response.status)];
  if (!documented) {
    throw new Error(
      `${method.toUpperCase()} ${path} respondió ${response.status}, que el contrato no documenta ` +
        `(documentados: ${Object.keys(operation.responses).join(', ')}). Body: ${JSON.stringify(response.body)}`,
    );
  }

  const resolved = resolveResponse(documented);
  const [mediaType, media] = Object.entries(resolved.content ?? {})[0] ?? [];
  if (!mediaType || !media) {
    expect(response.text ?? '').toBe('');
  } else {
    expect(response.headers['content-type']).toContain(mediaType);
    const validate = validatorFor(`${method} ${path} ${response.status}`, media.schema);
    if (!validate(response.body)) {
      throw new Error(
        `${method.toUpperCase()} ${path} ${response.status} no cumple el schema del contrato:\n` +
          `${ajv.errorsText(validate.errors, { separator: '\n' })}\nBody: ${JSON.stringify(response.body).slice(0, 2000)}`,
      );
    }
  }
  coverage.add(`${method.toUpperCase()} ${path} ${response.status}`);
}

/** Todas las combinaciones operación + status documentadas en el contrato. */
export function documentedResponses(): string[] {
  return Object.entries(contract.paths).flatMap(([path, item]) =>
    Object.entries(item).flatMap(([method, operation]) =>
      Object.keys(operation.responses).map((status) => `${method.toUpperCase()} ${path} ${status}`),
    ),
  );
}
