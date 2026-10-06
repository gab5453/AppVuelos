import { loadAuthConfig } from '../../src/auth/auth.config.js';
import { issueDevToken } from '../../src/auth/dev-token-issuer.js';

/** Header Authorization con un JWT firmado con la misma configuración que verifica la API. */
export async function bearer(sub: string, scopes: string[]): Promise<string> {
  return `Bearer ${await issueDevToken({ sub, scopes }, loadAuthConfig())}`;
}
