import { Module } from '@nestjs/common';
import { HoldController } from './presentation/hold.controller.js';
import { HoldService } from './application/hold.service.js';
import { HOLD_REPOSITORY_PORT } from './domain/ports/hold-repository.port.js';
import { OFFER_INVENTORY_PORT } from './domain/ports/offer-inventory.port.js';
import { InMemoryHoldRepository } from './infrastructure/in-memory-hold.repository.js';
import { GdsOfferInventoryAdapter } from './infrastructure/gds-offer-inventory.adapter.js';

/** Exporta HoldService para que bookings consuma holds (en microservicios sería una llamada HTTP). */
@Module({
  controllers: [HoldController],
  providers: [
    HoldService,
    { provide: HOLD_REPOSITORY_PORT, useClass: InMemoryHoldRepository },
    { provide: OFFER_INVENTORY_PORT, useClass: GdsOfferInventoryAdapter },
  ],
  exports: [HoldService],
})
export class OffersModule {}
