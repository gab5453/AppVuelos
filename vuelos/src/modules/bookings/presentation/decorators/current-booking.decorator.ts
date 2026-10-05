import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { BookingRecord } from '../../domain/ports/booking-repository.port.js';
import type { RequestWithBooking } from '../guards/booking-ownership.guard.js';

/** Inyecta la reserva ya resuelta y verificada por BookingOwnershipGuard. */
export const CurrentBooking = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BookingRecord => {
    const request = ctx.switchToHttp().getRequest<RequestWithBooking>();
    return request.booking as BookingRecord;
  },
);
