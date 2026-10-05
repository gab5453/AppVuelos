import { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemDetailsException } from '../problem-details/problem-details.exception.js';
import type { ProblemDetailsInvalidParam } from '../problem-details/problem-details.types.js';

/** Propiedades declaradas de PaymentReference (`additionalProperties: false` en el contrato). */
export const PAYMENT_REFERENCE_KEYS = ['paymentReference'] as const;

export interface ForbidUnknownPropertiesOptions {
  /** Propiedades permitidas en la raíz del body. Omitir si el schema raíz admite propiedades adicionales. */
  root?: readonly string[];
  /** Propiedades permitidas en objetos anidados de primer nivel cuyo schema es estricto (p. ej. `payment`). */
  nested?: Record<string, readonly string[]>;
}

/**
 * Rechaza (400 ProblemDetails) propiedades del body no declaradas en el schema, replicando
 * `additionalProperties: false` para los schemas cuyo OpenAPI lo declara explícitamente.
 *
 * Se implementa como Guard —no como opción del ValidationPipe— porque los Guards se ejecutan
 * antes que los Pipes: el ValidationPipe global (`whitelist: true`) ya elimina en silencio las
 * propiedades desconocidas del body antes de que cualquier Pipe adicional pudiera detectarlas,
 * así que un `forbidNonWhitelisted` de segundo nivel nunca vería nada que rechazar.
 * Tampoco se activa `forbidNonWhitelisted` globalmente porque el contrato solo marca
 * `additionalProperties: false` en un subconjunto de schemas (SearchRequest, BookingRequest,
 * PaymentReference); el resto permite propiedades adicionales, y rechazarlas contradiría el contrato.
 */
export class ForbidUnknownPropertiesGuard implements CanActivate {
  constructor(private readonly options: ForbidUnknownPropertiesOptions) {}

  canActivate(context: ExecutionContext): boolean {
    const body: unknown = context.switchToHttp().getRequest<Request>().body;
    if (!isPlainObject(body)) {
      return true;
    }

    const invalidParams: ProblemDetailsInvalidParam[] = [];
    if (this.options.root) {
      invalidParams.push(...unknownKeys(body, this.options.root, ''));
    }
    for (const [property, allowedKeys] of Object.entries(this.options.nested ?? {})) {
      const nested = body[property];
      if (isPlainObject(nested)) {
        invalidParams.push(...unknownKeys(nested, allowedKeys, `${property}.`));
      }
    }

    if (invalidParams.length > 0) {
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'La petición contiene propiedades no permitidas por el contrato.',
        invalidParams,
      });
    }

    return true;
  }
}

function unknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  prefix: string,
): ProblemDetailsInvalidParam[] {
  return Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .map((key) => ({ name: `${prefix}${key}`, reason: 'property not allowed' }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
