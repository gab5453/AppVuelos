import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { CheckInController } from './presentation/check-in.controller.js';
import { CheckInService } from './application/check-in.service.js';
import { CHECK_IN_REPOSITORY_PORT } from './domain/ports/check-in-repository.port.js';
import { DEPARTURE_CONTROL_PORT } from './domain/ports/departure-control.port.js';
import { InMemoryCheckInRepository } from './infrastructure/in-memory-check-in.repository.js';
import { GdsDepartureControlAdapter } from './infrastructure/gds-departure-control.adapter.js';

/**
 * Dominio **check-in** — dueño de los check-ins y pases de abordar (BD futura: `check-in`).
 * Usa de bookings solo su API pública (`BookingsFacade` y `BookingOwnershipGuard`).
 */
@Module({
  imports: [BookingsModule],
  controllers: [CheckInController],
  providers: [
    CheckInService,
    { provide: CHECK_IN_REPOSITORY_PORT, useClass: InMemoryCheckInRepository },
    { provide: DEPARTURE_CONTROL_PORT, useClass: GdsDepartureControlAdapter },
  ],
})
export class CheckInModule {}
