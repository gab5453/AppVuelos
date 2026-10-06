import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { BookingsService } from '@ecoairlines/business/services/bookings/bookings.service.js';
import type { TicketListResponseDto } from '@ecoairlines/business/dto/bookings/booking-detail.dto.js';
import type { Ticket } from '@ecoairlines/data-access/common/contract/common.types.js';
import { BookingOwnershipGuard } from './booking-ownership.guard.js';
import { CurrentBooking } from './current-booking.decorator.js';
import type { BookingSnapshot } from '@ecoairlines/business/services/bookings/bookings.facade.js';

@Controller('bookings/:bookingId/tickets')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
@Scopes('flights:read')
export class TicketsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list(@CurrentBooking() booking: BookingSnapshot): TicketListResponseDto {
    return this.bookingsService.listTickets(booking);
  }

  @Get(':ticketId')
  getOne(@CurrentBooking() booking: BookingSnapshot, @Param('ticketId') ticketId: string): Ticket {
    return this.bookingsService.getTicket(booking, ticketId);
  }
}
