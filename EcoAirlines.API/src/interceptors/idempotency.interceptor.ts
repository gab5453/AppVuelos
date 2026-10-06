import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ProblemDetailsException } from '@ecoairlines/business/exceptions/problem-details.exception.js';
import { UUID_PATTERN } from '@ecoairlines/business/validation/patterns.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import {
  IDEMPOTENCY_REPOSITORY,
  type IdempotencyRepository,
} from '@ecoairlines/data-management/interfaces/idempotency/idempotency.repository.js';

/**
 * Exige y aplica el header Idempotency-Key en endpoints que lo requieren según el contrato.
 * La identidad de la operación combina método, ruta, key, usuario (sub) y body: reutilizar la
 * misma key con un fingerprint distinto (u otra en curso) responde 409 en vez de servir una
 * respuesta cacheada incompatible.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IDEMPOTENCY_REPOSITORY) private readonly store: IdempotencyRepository) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = request.header('Idempotency-Key');

    if (!key || !UUID_PATTERN.test(key)) {
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'El header Idempotency-Key es requerido y debe ser un UUID.',
        invalidParams: [{ name: 'Idempotency-Key', reason: 'must be a valid UUID' }],
      });
    }

    // La clave se aísla por usuario: dos clientes que generen la misma key no colisionan entre sí.
    const scopedKey = `${request.user?.sub ?? '-'}:${request.method}:${request.originalUrl}:${key}`;
    const fingerprint = createHash('sha256')
      .update(request.method)
      .update('\u0000')
      .update(request.originalUrl)
      .update('\u0000')
      .update(request.user?.sub ?? '')
      .update('\u0000')
      .update(JSON.stringify(request.body ?? {}))
      .digest('hex');

    const claim = await this.store.claim(scopedKey, fingerprint);

    if (claim.outcome === 'CONFLICT' || claim.outcome === 'IN_PROGRESS') {
      throw new ProblemDetailsException({
        status: 409,
        code: 'VALIDATION_FAILED',
        title:
          claim.outcome === 'CONFLICT'
            ? 'El Idempotency-Key ya fue utilizado con una solicitud diferente.'
            : 'Ya existe una operación en curso para este Idempotency-Key.',
        invalidParams: [{ name: 'Idempotency-Key', reason: claim.outcome }],
      });
    }

    if (claim.outcome === 'COMPLETED') {
      response.status(claim.record.statusCode);
      return of(claim.record.body);
    }

    return next.handle().pipe(
      tap((body) => {
        void this.store.complete(scopedKey, {
          statusCode: response.statusCode,
          body,
          createdAt: new Date(),
        });
      }),
      catchError((error: unknown) => {
        void this.store.release(scopedKey);
        return throwError(() => error);
      }),
    );
  }
}
