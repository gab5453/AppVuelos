import { Body, Controller, Put, UseGuards } from '@nestjs/common';
import { ChangeSeatRequestDto, type ChangeSeatResponseDto } from '@ecoairlines/business/dto/bookings/change-seat.dto.js';
import type { BookingSnapshot } from '@ecoairlines/business/services/bookings/bookings.facade.js';
import { SeatChangeService } from '@ecoairlines/business/services/bookings/seat-change.service.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import { ForbidUnknownPropertiesGuard } from '../../guards/forbid-unknown-properties.guard.js';
import { BookingOwnershipGuard } from './booking-ownership.guard.js';
import { CurrentBooking } from './current-booking.decorator.js';

/**
 * Cambio de asiento — **extensión fuera del contrato** (`PUT /bookings/{bookingId}/seat`, de la plantilla del
 * grupo). Como el resto de operaciones sobre una reserva, exige `flights:book` y que la reserva sea del usuario.
 */
@Controller('bookings/:bookingId/seat')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
export class SeatChangeController {
  constructor(private readonly seatChange: SeatChangeService) {}

  @Put()
  @Scopes('flights:book')
  @UseGuards(new ForbidUnknownPropertiesGuard({ root: ['passengerId', 'newSeatNumber', 'segmentId'] }))
  changeSeat(@CurrentBooking() booking: BookingSnapshot, @Body() body: ChangeSeatRequestDto): Promise<ChangeSeatResponseDto> {
    return this.seatChange.changeSeat(booking, body);
  }
}
