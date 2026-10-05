import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemDetailsException } from '../../../../common/problem-details/problem-details.exception.js';

/** Exige el header obligatorio X-Device-Fingerprint del contrato en POST /search. */
@Injectable()
export class DeviceFingerprintGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const fingerprint = request.header('X-Device-Fingerprint');

    if (!fingerprint) {
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'El header X-Device-Fingerprint es requerido.',
        invalidParams: [{ name: 'X-Device-Fingerprint', reason: 'must be present' }],
      });
    }

    return true;
  }
}
