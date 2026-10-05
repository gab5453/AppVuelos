import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemDetailsException } from '../../../../common/problem-details/problem-details.exception.js';
import { UUID_PATTERN } from '../../../../common/validation/patterns.js';
import type { AuthenticatedUser } from '../../../../common/auth/interfaces/authenticated-user.interface.js';
import {
  BOOKING_REPOSITORY_PORT,
  type BookingRecord,
  type BookingRepositoryPort,
} from '../../domain/ports/booking-repository.port.js';

export type RequestWithBooking = Request & {
  user?: AuthenticatedUser;
  booking?: BookingRecord;
};

/**
 * Debe ejecutarse después de OAuth2AuthGuard (requiere `request.user` ya poblado). Resuelve
 * `:bookingId` contra el repositorio y exige que pertenezca al `sub` del token; en caso
 * contrario responde 404 sin distinguir "no existe" de "pertenece a otro usuario" (evita IDOR).
 * Centraliza esta validación de propiedad para todos los endpoints de postventa y check-in en
 * vez de repetirla en cada servicio.
 */
@Injectable()
export class BookingOwnershipGuard implements CanActivate {
  constructor(
    @Inject(BOOKING_REPOSITORY_PORT) private readonly bookingRepository: BookingRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithBooking>();
    const bookingId = String(request.params.bookingId ?? '');

    if (!bookingId || !UUID_PATTERN.test(bookingId)) {
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'bookingId debe ser un UUID válido.',
        invalidParams: [{ name: 'bookingId', reason: 'must be a valid UUID' }],
      });
    }

    const record = await this.bookingRepository.findById(bookingId);
    if (!record || record.ownerId !== request.user?.sub) {
      throw ProblemDetailsException.notFound('Reserva no encontrada.');
    }

    request.booking = record;
    return true;
  }
}
