import { Throttle } from '@nestjs/throttler';
import { loadSecurityConfig } from './security.config.js';

/**
 * Límites más estrictos para los endpoints públicos que el contrato documenta con `429`
 * (POST /search y GET /offers/{offerId}/seatmap). Reemplazan al límite global en esa ruta.
 * Los valores se resuelven por petición desde el entorno (RATE_LIMIT_*).
 */
export const SearchRateLimit = () =>
  Throttle({
    default: {
      limit: () => loadSecurityConfig().rateLimit.searchLimit,
      ttl: () => loadSecurityConfig().rateLimit.ttlMs,
    },
  });

export const SeatmapRateLimit = () =>
  Throttle({
    default: {
      limit: () => loadSecurityConfig().rateLimit.seatmapLimit,
      ttl: () => loadSecurityConfig().rateLimit.ttlMs,
    },
  });
