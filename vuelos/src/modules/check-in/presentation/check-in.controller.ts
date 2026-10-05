import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { OAuth2AuthGuard } from '../../../common/auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../../common/auth/guards/scopes.guard.js';
import { Scopes } from '../../../common/auth/decorators/scopes.decorator.js';
import { BookingOwnershipGuard } from '../../bookings/presentation/guards/booking-ownership.guard.js';
import { CurrentBooking } from '../../bookings/presentation/decorators/current-booking.decorator.js';
import type { BookingSnapshot } from '../../bookings/application/bookings.facade.js';
import { CheckInService } from '../application/check-in.service.js';
import type { CheckInResponseDto } from './dto/check-in.dto.js';
import type { BoardingPassListResponseDto } from './dto/boarding-pass.dto.js';

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
