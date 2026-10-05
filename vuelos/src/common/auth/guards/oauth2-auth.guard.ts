import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemDetailsException } from '../../problem-details/problem-details.exception.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';
import { TOKEN_VERIFIER_PORT, type TokenVerifierPort } from '../interfaces/token-verifier.port.js';

/**
 * Valida el Bearer token vía TokenVerifierPort y adjunta AuthenticatedUser a la request.
 * El contrato no documenta una respuesta 401 explícita (asume que el gateway OAuth2 la
 * produce), pero el guard debe rechazar peticiones sin token válido de todos modos.
 */
@Injectable()
export class OAuth2AuthGuard implements CanActivate {
  constructor(@Inject(TOKEN_VERIFIER_PORT) private readonly tokenVerifier: TokenVerifierPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new ProblemDetailsException({
        status: 401,
        code: 'VALIDATION_FAILED',
        title: 'Falta el header Authorization Bearer.',
      });
    }

    try {
      request.user = await this.tokenVerifier.verify(authHeader.slice('Bearer '.length));
    } catch {
      throw new ProblemDetailsException({
        status: 401,
        code: 'VALIDATION_FAILED',
        title: 'Token inválido o expirado.',
      });
    }

    return true;
  }
}
