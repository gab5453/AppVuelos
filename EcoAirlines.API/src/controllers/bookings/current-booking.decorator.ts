import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { BookingSnapshot } from '@ecoairlines/business/services/bookings/bookings.facade.js';
import type { RequestWithBooking } from './booking-ownership.guard.js';

/** Inyecta la reserva (copia de solo lectura) ya resuelta y verificada por BookingOwnershipGuard. */
export const CurrentBooking = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BookingSnapshot => {
    const request = ctx.switchToHttp().getRequest<RequestWithBooking>();
    return request.booking as BookingSnapshot;
  },
);
