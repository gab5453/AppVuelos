import { Module } from '@nestjs/common';
import { FlightStatusController } from './presentation/flight-status.controller.js';
import { FlightStatusService } from './application/flight-status.service.js';
import { FLIGHT_STATUS_PROVIDER_PORT } from './domain/ports/flight-status-provider.port.js';
import { MockFlightStatusProviderAdapter } from './infrastructure/mock-flight-status-provider.adapter.js';

@Module({
  controllers: [FlightStatusController],
  providers: [
    FlightStatusService,
    { provide: FLIGHT_STATUS_PROVIDER_PORT, useClass: MockFlightStatusProviderAdapter },
  ],
})
export class FlightStatusModule {}
