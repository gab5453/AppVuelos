import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { BaggageService } from '../application/baggage.service.js';
import { AddBaggageRequestDto } from './dto/baggage.dto.js';
import type { BaggageAddedResponseDto, BaggageOptionsResponseDto } from './dto/baggage.dto.js';

@Controller('bookings/:bookingId')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
export class BaggageController {
  constructor(private readonly baggageService: BaggageService) {}

  @Get('baggage-options')
  @Scopes('flights:read')
  getOptions(@CurrentBooking() booking: BookingRecord): Promise<BaggageOptionsResponseDto> {
    return this.baggageService.getOptions(booking);
  }

  @Post('baggage')
  @Scopes('flights:book')
  @UseGuards(new ForbidUnknownPropertiesGuard({ nested: { payment: PAYMENT_REFERENCE_KEYS } }))
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  async addBaggage(
    @CurrentBooking() booking: BookingRecord,
    @Body() body: AddBaggageRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BaggageAddedResponseDto | undefined> {
    const result = await this.baggageService.addBaggage(booking, body);
    response.status(result.statusCode);
    return result.body;
  }
}
