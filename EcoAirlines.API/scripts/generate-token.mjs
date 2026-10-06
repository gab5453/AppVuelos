// Genera un JWT de desarrollo firmado con la misma configuración que usa la API (AUTH_JWT_SECRET,
// AUTH_ISSUER, AUTH_AUDIENCE). Uso:
//   npm run token -- --sub user-1 --scopes flights:read,flights:book --expires 2h
// Sin --scopes se incluyen todos los scopes del contrato y los propios de las extensiones (ecoairlines:*).
// Se recomienda separar con comas: en Windows npm pasa los argumentos por cmd, que altera los valores
// entre comillas con espacios.
import { parseArgs } from 'node:util';
import { loadAuthConfig } from '../dist/auth/auth.config.js';
import { issueDevToken } from '../dist/auth/dev-token-issuer.js';

const CONTRACT_SCOPES = ['flights:read', 'flights:hold', 'flights:book', 'flights:cancel', 'flights:webhooks'];
/** Scopes propios de las extensiones fuera del contrato (contract/ecoairlines-extensions.yaml). */
const EXTENSION_SCOPES = ['ecoairlines:profile', 'ecoairlines:admin'];
const ALL_SCOPES = [...CONTRACT_SCOPES, ...EXTENSION_SCOPES];

const { values } = parseArgs({
  options: {
    sub: { type: 'string', default: 'dev-user-1' },
    scopes: { type: 'string' },
    expires: { type: 'string', default: '1h' },
  },
});

const scopes = values.scopes ? values.scopes.split(/[\s,]+/).filter(Boolean) : ALL_SCOPES;
const unknownScopes = scopes.filter((scope) => !ALL_SCOPES.includes(scope));
if (unknownScopes.length) {
  console.error(`Scopes no definidos en el contrato ni en las extensiones: ${unknownScopes.join(', ')}`);
  console.error(`Válidos: ${ALL_SCOPES.join(', ')}`);
  process.exit(1);
}

try {
  const token = await issueDevToken({ sub: values.sub, scopes, expiresIn: values.expires }, loadAuthConfig());
  console.error(`sub=${values.sub} scopes="${scopes.join(' ')}" expira en ${values.expires}\n`);
  console.log(token);
} catch (error) {
  console.error(`No se pudo generar el token: ${error.message}`);
  process.exit(1);
}
