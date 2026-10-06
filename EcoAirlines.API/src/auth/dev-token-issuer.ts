import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { AuthConfigError, type AuthConfig } from './auth.config.js';

export interface DevTokenRequest {
  sub: string;
  scopes: string[];
  /** Duración del token, formato de `jose` (p. ej. '1h', '15m'). */
  expiresIn?: string;
}

/**
 * Emite JWT firmados con el secreto compartido para desarrollo y pruebas (Swagger, Postman, e2e).
 * No es un endpoint de la API: la autenticación real pertenece al authorization server del contrato.
 * Se niega a firmar en producción o cuando la API verifica contra un JWKS externo.
 */
export async function issueDevToken(
  request: DevTokenRequest,
  config: AuthConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (env.NODE_ENV === 'production') {
    throw new AuthConfigError('No se emiten tokens de desarrollo en producción.');
  }
  if (config.mode !== 'secret') {
    throw new AuthConfigError('Con AUTH_JWKS_URL los tokens los emite el proveedor OAuth2, no esta herramienta.');
  }

  return new SignJWT({ scope: request.scopes.join(' ') })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(request.sub)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(request.expiresIn ?? '1h')
    .sign(new TextEncoder().encode(config.secret));
}
