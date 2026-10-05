import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { OAuth2AuthGuard } from '../../../common/auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../../common/auth/guards/scopes.guard.js';
import { Scopes } from '../../../common/auth/decorators/scopes.decorator.js';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor.js';
import { BookingOwnershipGuard } from '../../bookings/presentation/guards/booking-ownership.guard.js';
import { CurrentBooking } from '../../bookings/presentation/decorators/current-booking.decorator.js';
import type { BookingRecord } from '../../bookings/domain/ports/booking-repository.port.js';
import { CancellationService } from '../application/cancellation.service.js';
import { CancelBookingRequestDto } from './dto/cancellation.dto.js';
import type { CancellationQuoteResponseDto } from './dto/cancellation.dto.js';

@Controller('bookings/:bookingId')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
export class CancellationController {
  constructor(private readonly cancellationService: CancellationService) {}

  @Get('cancellation-quote')
  @Scopes('flights:read')
  getQuote(@CurrentBooking() booking: BookingRecord): Promise<CancellationQuoteResponseDto> {
    return this.cancellationService.getQuote(booking);
  }

  @Post('cancel')
  @Scopes('flights:cancel')
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentBooking() booking: BookingRecord,
    @Body() body: CancelBookingRequestDto,
  ): Promise<void> {
    return this.cancellationService.cancel(booking, body);
  }
}
