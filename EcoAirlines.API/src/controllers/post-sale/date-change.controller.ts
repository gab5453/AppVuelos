import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { IdempotencyInterceptor } from '../../interceptors/idempotency.interceptor.js';
import {
  ForbidUnknownPropertiesGuard,
  PAYMENT_REFERENCE_KEYS,
} from '../../guards/forbid-unknown-properties.guard.js';
import { BookingOwnershipGuard } from '../bookings/booking-ownership.guard.js';
import { CurrentBooking } from '../bookings/current-booking.decorator.js';
import type { BookingSnapshot } from '@ecoairlines/business/services/bookings/bookings.facade.js';
import { DateChangeService } from '@ecoairlines/business/services/post-sale/date-change.service.js';
import { DateChangeRequestDto, DateChangeSearchRequestDto } from '@ecoairlines/business/dto/post-sale/date-change.dto.js';
import type { DateChangeSearchResponseDto } from '@ecoairlines/business/dto/post-sale/date-change.dto.js';
import type { BookingDetail } from '@ecoairlines/data-access/common/contract/booking.types.js';

@Controller('bookings/:bookingId/date-change')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
export class DateChangeController {
  constructor(private readonly dateChangeService: DateChangeService) {}

  @Post('search')
  @Scopes('flights:read')
  @HttpCode(HttpStatus.OK)
  search(
    @CurrentBooking() booking: BookingSnapshot,
    @Body() body: DateChangeSearchRequestDto,
  ): Promise<DateChangeSearchResponseDto> {
    return this.dateChangeService.search(booking, body);
  }

  @Post()
  @Scopes('flights:book')
  @UseGuards(new ForbidUnknownPropertiesGuard({ nested: { payment: PAYMENT_REFERENCE_KEYS } }))
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentBooking() booking: BookingSnapshot,
    @Body() body: DateChangeRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingDetail | undefined> {
    const result = await this.dateChangeService.confirm(booking, body);
    response.status(result.statusCode);
    return result.body;
  }
}
