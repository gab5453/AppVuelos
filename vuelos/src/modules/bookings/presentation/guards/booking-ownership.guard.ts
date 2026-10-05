import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemDetailsException } from '../../../../common/problem-details/problem-details.exception.js';
import { UUID_PATTERN } from '../../../../common/validation/patterns.js';
import type { AuthenticatedUser } from '../../../../common/auth/interfaces/authenticated-user.interface.js';
import { BookingsFacade, type BookingSnapshot } from '../../application/bookings.facade.js';

export type RequestWithBooking = Request & {
  user?: AuthenticatedUser;
  booking?: BookingSnapshot;
};

/**
 * Debe ejecutarse después de OAuth2AuthGuard (requiere `request.user` ya poblado). Resuelve
 * `:bookingId` con `BookingsFacade` y exige que pertenezca al `sub` del token; en caso contrario
 * responde 404 sin distinguir "no existe" de "pertenece a otro usuario" (evita IDOR).
 * Adjunta a la request una COPIA de solo lectura (`BookingSnapshot`): quien la recibe no puede
 * modificar la reserva directamente, solo mediante la fachada.
 */
@Injectable()
export class BookingOwnershipGuard implements CanActivate {
  constructor(private readonly bookings: BookingsFacade) {}

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

    const booking = await this.bookings.findOwned(request.user?.sub ?? '', bookingId);
    if (!booking) {
      throw ProblemDetailsException.notFound('Reserva no encontrada.');
    }

    request.booking = booking;
    return true;
  }
}
