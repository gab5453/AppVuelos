/**
 * Configuración de verificación de JWT. Dos modos:
 * - `jwks`: proveedor OAuth2 real (p. ej. https://auth.booking-hub.com), claves públicas RS256/ES256.
 * - `secret`: secreto compartido HS256, pensado para desarrollo y pruebas locales.
 *
 * En producción la configuración debe ser explícita; fuera de producción se usan valores por defecto
 * de desarrollo para no bloquear el arranque local.
 */

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

/** Secreto de desarrollo. Público a propósito: nunca es válido en producción. */
export const DEV_JWT_SECRET = 'vuelos-dev-only-secret-do-not-use-in-production-0001';
export const DEV_JWT_ISSUER = 'vuelos-dev-auth';
export const DEFAULT_JWT_AUDIENCE = 'vuelos-api';

/** HS256 exige al menos 256 bits de clave (RFC 7518 §3.2). */
const MIN_SECRET_LENGTH = 32;
const DEFAULT_ASYMMETRIC_ALGORITHMS = ['RS256', 'ES256'];

interface BaseAuthConfig {
  issuer: string;
  audience: string;
  algorithms: string[];
  /** Tolerancia de reloj, en segundos, para `exp`/`nbf`. */
  clockToleranceSeconds: number;
}

export interface JwksAuthConfig extends BaseAuthConfig {
  mode: 'jwks';
  jwksUrl: string;
}

export interface SecretAuthConfig extends BaseAuthConfig {
  mode: 'secret';
  secret: string;
  /** true si se están usando los valores por defecto de desarrollo. */
  usingDevDefaults: boolean;
}

export type AuthConfig = JwksAuthConfig | SecretAuthConfig;

export class AuthConfigError extends Error {}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const isProduction = env.NODE_ENV === 'production';
  const clockToleranceSeconds = Number(env.AUTH_CLOCK_TOLERANCE_SECONDS ?? 5);

  if (isProduction && (!env.AUTH_ISSUER || !env.AUTH_AUDIENCE)) {
    throw new AuthConfigError('En producción AUTH_ISSUER y AUTH_AUDIENCE son obligatorios.');
  }

  if (env.AUTH_JWKS_URL) {
    if (isProduction && !env.AUTH_JWKS_URL.startsWith('https://')) {
      throw new AuthConfigError('En producción AUTH_JWKS_URL debe usar https.');
    }
    return {
      mode: 'jwks',
      jwksUrl: env.AUTH_JWKS_URL,
      issuer: env.AUTH_ISSUER ?? DEV_JWT_ISSUER,
      audience: env.AUTH_AUDIENCE ?? DEFAULT_JWT_AUDIENCE,
      algorithms: parseList(env.AUTH_JWT_ALGORITHMS) ?? DEFAULT_ASYMMETRIC_ALGORITHMS,
      clockToleranceSeconds,
    };
  }

  if (isProduction && !env.AUTH_JWT_SECRET) {
    throw new AuthConfigError('En producción se requiere AUTH_JWKS_URL o AUTH_JWT_SECRET.');
  }
  if (isProduction && env.AUTH_JWT_SECRET === DEV_JWT_SECRET) {
    throw new AuthConfigError('El secreto de desarrollo no puede usarse en producción.');
  }

  const secret = env.AUTH_JWT_SECRET ?? DEV_JWT_SECRET;
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new AuthConfigError(`AUTH_JWT_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`);
  }

  return {
    mode: 'secret',
    secret,
    issuer: env.AUTH_ISSUER ?? DEV_JWT_ISSUER,
    audience: env.AUTH_AUDIENCE ?? DEFAULT_JWT_AUDIENCE,
    algorithms: ['HS256'],
    clockToleranceSeconds,
    usingDevDefaults: !env.AUTH_JWT_SECRET,
  };
}

function parseList(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items?.length ? items : undefined;
}
