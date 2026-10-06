import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { BaggageService } from '@ecoairlines/business/services/post-sale/baggage.service.js';
import { AddBaggageRequestDto } from '@ecoairlines/business/dto/post-sale/baggage.dto.js';
import type { BaggageAddedResponseDto, BaggageOptionsResponseDto } from '@ecoairlines/business/dto/post-sale/baggage.dto.js';

@Controller('bookings/:bookingId')
@UseGuards(OAuth2AuthGuard, ScopesGuard, BookingOwnershipGuard)
export class BaggageController {
  constructor(private readonly baggageService: BaggageService) {}

  @Get('baggage-options')
  @Scopes('flights:read')
  getOptions(@CurrentBooking() booking: BookingSnapshot): Promise<BaggageOptionsResponseDto> {
    return this.baggageService.getOptions(booking);
  }

  @Post('baggage')
  @Scopes('flights:book')
  @UseGuards(new ForbidUnknownPropertiesGuard({ nested: { payment: PAYMENT_REFERENCE_KEYS } }))
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  async addBaggage(
    @CurrentBooking() booking: BookingSnapshot,
    @Body() body: AddBaggageRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BaggageAddedResponseDto | undefined> {
    const result = await this.baggageService.addBaggage(booking, body);
    response.status(result.statusCode);
    return result.body;
  }
}
