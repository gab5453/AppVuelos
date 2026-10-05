/**
 * Configuración transversal de seguridad HTTP (CORS, proxy, límites de body y de peticiones).
 * Se lee del entorno en el momento de uso para que cada instancia de la app (incluidas las de
 * pruebas) tome los valores vigentes.
 */

export class SecurityConfigError extends Error {}

export interface RateLimitConfig {
  /** Ventana de conteo, en milisegundos. */
  ttlMs: number;
  /** Límite global por IP y ventana. */
  limit: number;
  /** Límite de POST /search (el contrato documenta 429 aquí). */
  searchLimit: number;
  /** Límite de GET /offers/{offerId}/seatmap (el contrato documenta 429 aquí). */
  seatmapLimit: number;
}

export interface SecurityConfig {
  isProduction: boolean;
  corsOrigins: string[];
  /** Valor para `trust proxy` de Express: false, true, número de saltos o lista de IPs/subredes. */
  trustProxy: boolean | number | string;
  bodyLimit: string;
  rateLimit: RateLimitConfig;
}

const DEV_CORS_ORIGINS = ['http://localhost:5173'];

export function loadSecurityConfig(env: NodeJS.ProcessEnv = process.env): SecurityConfig {
  const isProduction = env.NODE_ENV === 'production';

  const corsOrigins = env.CORS_ORIGINS !== undefined ? parseList(env.CORS_ORIGINS) : isProduction ? [] : DEV_CORS_ORIGINS;
  if (corsOrigins.includes('*')) {
    throw new SecurityConfigError('CORS_ORIGINS no admite "*": declare los orígenes permitidos explícitamente.');
  }

  return {
    isProduction,
    corsOrigins,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    bodyLimit: env.BODY_LIMIT ?? '100kb',
    rateLimit: {
      ttlMs: positiveInt(env.RATE_LIMIT_TTL_MS, 60_000, 'RATE_LIMIT_TTL_MS'),
      limit: positiveInt(env.RATE_LIMIT_LIMIT, 300, 'RATE_LIMIT_LIMIT'),
      searchLimit: positiveInt(env.RATE_LIMIT_SEARCH_LIMIT, 30, 'RATE_LIMIT_SEARCH_LIMIT'),
      seatmapLimit: positiveInt(env.RATE_LIMIT_SEATMAP_LIMIT, 60, 'RATE_LIMIT_SEATMAP_LIMIT'),
    },
  };
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SecurityConfigError(`${name} debe ser un entero positivo.`);
  }
  return parsed;
}
