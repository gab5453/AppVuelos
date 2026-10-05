import { HttpException } from '@nestjs/common';
import type {
  ProblemDetailsBody,
  ProblemDetailsCode,
  ProblemDetailsInvalidParam,
} from './problem-details.types.js';

export interface ProblemDetailsExceptionOptions {
  status: number;
  code: ProblemDetailsCode;
  title: string;
  detail?: string;
  type?: string;
  invalidParams?: ProblemDetailsInvalidParam[];
  /** Presente en respuestas 409/429 del contrato, que documentan el header Retry-After. */
  retryAfterSeconds?: number;
}

export class ProblemDetailsException extends HttpException {
  public readonly retryAfterSeconds?: number;

  constructor(options: ProblemDetailsExceptionOptions) {
    const body: ProblemDetailsBody = {
      type: options.type ?? 'about:blank',
      title: options.title,
      status: options.status,
      code: options.code,
      ...(options.detail ? { detail: options.detail } : {}),
      ...(options.invalidParams ? { invalidParams: options.invalidParams } : {}),
    };
    super(body, options.status);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /**
   * 404 del contrato (`ProblemDetails404`). El enum `code` no tiene un valor genérico de
   * "no encontrado" (HALL-05), por lo que se usa VALIDATION_FAILED salvo que exista uno específico.
   */
  static notFound(title: string, code: ProblemDetailsCode = 'VALIDATION_FAILED'): ProblemDetailsException {
    return new ProblemDetailsException({ status: 404, code, title });
  }
}
