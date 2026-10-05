import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ProblemDetailsException } from '../../problem-details/problem-details.exception.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';
import { SCOPES_KEY } from '../decorators/scopes.decorator.js';

/** Debe ejecutarse después de OAuth2AuthGuard, que puebla request.user. */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredScopes?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const userScopes = request.user?.scopes ?? [];
    const hasAllScopes = requiredScopes.every((scope) => userScopes.includes(scope));

    if (!hasAllScopes) {
      throw new ProblemDetailsException({
        status: 403,
        code: 'VALIDATION_FAILED',
        title: 'El token no posee los scopes requeridos.',
        detail: `Scopes requeridos: ${requiredScopes.join(', ')}`,
      });
    }

    return true;
  }
}
