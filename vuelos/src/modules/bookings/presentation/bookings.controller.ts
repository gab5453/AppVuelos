import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { OAuth2AuthGuard } from '../../../common/auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../../common/auth/guards/scopes.guard.js';
import { Scopes } from '../../../common/auth/decorators/scopes.decorator.js';
import { CurrentUser } from '../../../common/auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../common/auth/interfaces/authenticated-user.interface.js';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor.js';
import { BookingsService } from '../application/bookings.service.js';
import { BookingRequestDto } from './dto/booking-request.dto.js';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';
import type { BookingDetailDto, BookingListResponseDto } from './dto/booking-detail.dto.js';
import { BookingOwnershipGuard } from './guards/booking-ownership.guard.js';
import { CurrentBooking } from './decorators/current-booking.decorator.js';
import type { BookingSnapshot } from '../application/bookings.facade.js';
import {
  ForbidUnknownPropertiesGuard,
  PAYMENT_REFERENCE_KEYS,
} from '../../../common/validation/forbid-unknown-properties.guard.js';

const BOOKING_REQUEST_KEYS = ['holdId', 'passengers', 'payment'] as const;

@Controller('bookings')
@UseGuards(OAuth2AuthGuard, ScopesGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @Scopes('flights:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListBookingsQueryDto,
  ): Promise<BookingListResponseDto> {
    return this.bookingsService.list(user.sub, query);
  }

  @Post()
  @Scopes('flights:book')
  @UseGuards(
    new ForbidUnknownPropertiesGuard({
      root: BOOKING_REQUEST_KEYS,
      nested: { payment: PAYMENT_REFERENCE_KEYS },
    }),
  )
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BookingRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingDetailDto> {
    // 201 con tickets emitidos; 202 si el pago o la emisión continúan de forma asíncrona.
    const result = await this.bookingsService.create(user.sub, body);
    response.status(result.statusCode);
    return result.booking;
  }

  @Get(':bookingId')
  @Scopes('flights:read')
  @UseGuards(BookingOwnershipGuard)
  getDetail(@CurrentBooking() booking: BookingSnapshot): BookingDetailDto {
    return this.bookingsService.getDetail(booking);
  }
}
