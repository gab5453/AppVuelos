import { Module } from '@nestjs/common';
import { SearchController } from './presentation/search.controller.js';
import { SeatMapController } from './presentation/seatmap.controller.js';
import { CatalogService } from './application/catalog.service.js';
import { FLIGHT_CATALOG_PORT } from './domain/ports/flight-catalog.port.js';
import { MockFlightCatalogAdapter } from './infrastructure/mock-flight-catalog.adapter.js';
import { DeviceFingerprintGuard } from './presentation/guards/device-fingerprint.guard.js';

@Module({
  controllers: [SearchController, SeatMapController],
  providers: [
    CatalogService,
    { provide: FLIGHT_CATALOG_PORT, useClass: MockFlightCatalogAdapter },
    DeviceFingerprintGuard,
  ],
})
export class SearchModule {}
