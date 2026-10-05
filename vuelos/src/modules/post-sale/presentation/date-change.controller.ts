import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { OAuth2AuthGuard } from '../../../common/auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../../common/auth/guards/scopes.guard.js';
import { Scopes } from '../../../common/auth/decorators/scopes.decorator.js';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor.js';
import {
  ForbidUnknownPropertiesGuard,
  PAYMENT_REFERENCE_KEYS,
} from '../../../common/validation/forbid-unknown-properties.guard.js';
import { BookingOwnershipGuard } from '../../bookings/presentation/guards/booking-ownership.guard.js';
import { CurrentBooking } from '../../bookings/presentation/decorators/current-booking.decorator.js';
import type { BookingRecord } from '../../bookings/domain/ports/booking-repository.port.js';
import { DateChangeService } from '../application/date-change.service.js';
import { DateChangeRequestDto, DateChangeSearchRequestDto } from './dto/date-change.dto.js';
import type { DateChangeSearchResponseDto } from './dto/date-change.dto.js';
import type { BookingDetail } from '../../../common/contract-types/booking.types.js';

@Controller('bookings/:bookingId/date-change')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
export class DateChangeController {
  constructor(private readonly dateChangeService: DateChangeService) {}

  @Post('search')
  @Scopes('flights:read')
  @HttpCode(HttpStatus.OK)
  search(
    @CurrentBooking() booking: BookingRecord,
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
    @CurrentBooking() booking: BookingRecord,
    @Body() body: DateChangeRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingDetail | undefined> {
    const result = await this.dateChangeService.confirm(booking, body);
    response.status(result.statusCode);
    return result.body;
  }
}
