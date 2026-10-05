import { Module } from '@nestjs/common';
import { OffersModule } from '../offers/offers.module.js';
import { BookingsController } from './presentation/bookings.controller.js';
import { TicketsController } from './presentation/tickets.controller.js';
import { BookingsService } from './application/bookings.service.js';
import { SeatAssignmentService } from './application/seat-assignment.service.js';
import { BOOKING_REPOSITORY_PORT } from './domain/ports/booking-repository.port.js';
import { HOLD_GATEWAY_PORT } from './domain/ports/hold-gateway.port.js';
import { PAYMENT_VERIFIER_PORT } from './domain/ports/payment-verifier.port.js';
import { RESERVATION_SYSTEM_PORT } from './domain/ports/reservation-system.port.js';
import { InMemoryBookingRepository } from './infrastructure/in-memory-booking.repository.js';
import { OffersHoldGatewayAdapter } from './infrastructure/offers-hold-gateway.adapter.js';
import { MockPaymentVerifierAdapter } from './infrastructure/mock-payment-verifier.adapter.js';
import { GdsReservationSystemAdapter } from './infrastructure/gds-reservation-system.adapter.js';
import { BookingOwnershipGuard } from './presentation/guards/booking-ownership.guard.js';

/**
 * Exporta el repositorio, el guard de propiedad y los ports de pago, GDS y asientos para
 * post-sale y check-in, que operan sobre reservas existentes.
 */
@Module({
  imports: [OffersModule],
  controllers: [BookingsController, TicketsController],
  providers: [
    BookingsService,
    SeatAssignmentService,
    { provide: BOOKING_REPOSITORY_PORT, useClass: InMemoryBookingRepository },
    { provide: HOLD_GATEWAY_PORT, useClass: OffersHoldGatewayAdapter },
    { provide: PAYMENT_VERIFIER_PORT, useClass: MockPaymentVerifierAdapter },
    { provide: RESERVATION_SYSTEM_PORT, useClass: GdsReservationSystemAdapter },
    BookingOwnershipGuard,
  ],
  exports: [
    BOOKING_REPOSITORY_PORT,
    PAYMENT_VERIFIER_PORT,
    RESERVATION_SYSTEM_PORT,
    SeatAssignmentService,
    BookingOwnershipGuard,
  ],
})
export class BookingsModule {}
