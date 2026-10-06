import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { BookingOwnershipGuard } from '../bookings/booking-ownership.guard.js';
import { CurrentBooking } from '../bookings/current-booking.decorator.js';
import type { BookingSnapshot } from '@ecoairlines/business/services/bookings/bookings.facade.js';
import { CheckInService } from '@ecoairlines/business/services/check-in/check-in.service.js';
import type { CheckInResponseDto } from '@ecoairlines/business/dto/check-in/check-in.dto.js';
import type { BoardingPassListResponseDto } from '@ecoairlines/business/dto/check-in/boarding-pass.dto.js';

@Controller('bookings/:bookingId')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
export class CheckInController {
  constructor(private readonly checkInService: CheckInService) {}

  @Post('check-in')
  @Scopes('flights:book')
  @HttpCode(HttpStatus.OK)
  checkIn(@CurrentBooking() booking: BookingSnapshot): Promise<CheckInResponseDto> {
    return this.checkInService.performCheckIn(booking);
  }

  @Get('boarding-passes')
  @Scopes('flights:read')
  getBoardingPasses(@CurrentBooking() booking: BookingSnapshot): Promise<BoardingPassListResponseDto> {
    return this.checkInService.getBoardingPasses(booking);
  }
}
