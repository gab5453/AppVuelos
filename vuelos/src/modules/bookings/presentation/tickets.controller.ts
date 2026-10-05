import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OAuth2AuthGuard } from '../../../common/auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../../common/auth/guards/scopes.guard.js';
import { Scopes } from '../../../common/auth/decorators/scopes.decorator.js';
import { BookingsService } from '../application/bookings.service.js';
import type { TicketListResponseDto } from './dto/booking-detail.dto.js';
import type { Ticket } from '../../../common/contract-types/common.types.js';
import { BookingOwnershipGuard } from './guards/booking-ownership.guard.js';
import { CurrentBooking } from './decorators/current-booking.decorator.js';
import type { BookingRecord } from '../domain/ports/booking-repository.port.js';

@Controller('bookings/:bookingId/tickets')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
@Scopes('flights:read')
export class TicketsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list(@CurrentBooking() booking: BookingRecord): TicketListResponseDto {
    return this.bookingsService.listTickets(booking);
  }

  @Get(':ticketId')
  getOne(@CurrentBooking() booking: BookingRecord, @Param('ticketId') ticketId: string): Ticket {
    return this.bookingsService.getTicket(booking, ticketId);
  }
}
