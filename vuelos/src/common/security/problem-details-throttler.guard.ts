import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { ProblemDetailsException } from '../problem-details/problem-details.exception.js';

/**
 * ThrottlerGuard que responde con el `ProblemDetails429` del contrato:
 * `code: RATE_LIMIT_EXCEEDED` y header `Retry-After` en segundos.
 * La clave del límite es la IP del cliente (normalizada por subred en IPv6); detrás de un
 * proxy, configurar TRUST_PROXY para que Express resuelva la IP real.
 */
@Injectable()
export class ProblemDetailsThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSeconds = Math.max(1, detail.timeToBlockExpire);
    throw new ProblemDetailsException({
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      title: 'Demasiadas peticiones.',
      detail: `Límite de ${detail.limit} peticiones excedido. Reintente en ${retryAfterSeconds} s.`,
      retryAfterSeconds,
    });
  }
}
