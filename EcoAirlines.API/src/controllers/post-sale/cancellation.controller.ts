import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { IdempotencyInterceptor } from '../../interceptors/idempotency.interceptor.js';
import { BookingOwnershipGuard } from '../bookings/booking-ownership.guard.js';
import { CurrentBooking } from '../bookings/current-booking.decorator.js';
import type { BookingSnapshot } from '@ecoairlines/business/services/bookings/bookings.facade.js';
import { CancellationService } from '@ecoairlines/business/services/post-sale/cancellation.service.js';
import { CancelBookingRequestDto } from '@ecoairlines/business/dto/post-sale/cancellation.dto.js';
import type { CancellationQuoteResponseDto } from '@ecoairlines/business/dto/post-sale/cancellation.dto.js';

@Controller('bookings/:bookingId')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
export class CancellationController {
  constructor(private readonly cancellationService: CancellationService) {}

  @Get('cancellation-quote')
  @Scopes('flights:read')
  getQuote(@CurrentBooking() booking: BookingSnapshot): Promise<CancellationQuoteResponseDto> {
    return this.cancellationService.getQuote(booking);
  }

  @Post('cancel')
  @Scopes('flights:cancel')
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentBooking() booking: BookingSnapshot,
    @Body() body: CancelBookingRequestDto,
  ): Promise<void> {
    return this.cancellationService.cancel(booking, body);
  }
}
