import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRequestId } from './request-context.js';
import { ProblemDetailsException } from '@ecoairlines/business/exceptions/problem-details.exception.js';
import type { ProblemDetailsBody } from '@ecoairlines/business/exceptions/problem-details.types.js';

/**
 * Convierte cualquier error en un ProblemDetails del contrato (`application/problem+json`).
 * - ProblemDetailsException: se responde tal cual (incluye Retry-After cuando corresponde).
 * - HttpException nativa de Nest (ruta inexistente, ParseUUIDPipe, etc.): 4xx con título estándar
 *   y el mensaje como `detail`; 5xx sin detalle.
 * - Cualquier otro error: 500 genérico. El mensaje y el stack solo se registran en el log, nunca
 *   en la respuesta.
 * El enum `code` no tiene valores genéricos (HALL-05), por lo que se usa VALIDATION_FAILED.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();

    if (response.headersSent) {
      this.logError(request, exception);
      return;
    }

    if (exception instanceof ProblemDetailsException) {
      if (exception.retryAfterSeconds !== undefined) {
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
      this.send(response, exception.getResponse() as ProblemDetailsBody);
      return;
    }

    if (exception instanceof HttpException && exception.getStatus() < 500) {
      const status = exception.getStatus();
      this.send(response, {
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        code: 'VALIDATION_FAILED',
        detail: exception.message,
      });
      return;
    }

    this.logError(request, exception);
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    this.send(response, {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Internal Server Error',
      status,
      code: 'VALIDATION_FAILED',
    });
  }

  private send(response: Response, body: ProblemDetailsBody): void {
    response.status(body.status).contentType('application/problem+json').json(body);
  }

  private logError(request: Request, exception: unknown): void {
    const requestId = getRequestId(request);
    const description = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(`[requestId=${requestId ?? '-'}] ${request.method} ${request.path} → ${description}`);
  }
}
