import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { BaggageController } from './presentation/baggage.controller.js';
import { DateChangeController } from './presentation/date-change.controller.js';
import { CancellationController } from './presentation/cancellation.controller.js';
import { BaggageService } from './application/baggage.service.js';
import { DateChangeService } from './application/date-change.service.js';
import { CancellationService } from './application/cancellation.service.js';
import { CANCELLATION_QUOTE_STORE, DATE_CHANGE_OFFER_STORE } from './domain/ports/quote-store.port.js';
import { InMemoryQuoteStore } from './infrastructure/in-memory-quote.store.js';

@Module({
  imports: [BookingsModule],
  controllers: [BaggageController, DateChangeController, CancellationController],
  providers: [
    BaggageService,
    DateChangeService,
    CancellationService,
    { provide: DATE_CHANGE_OFFER_STORE, useFactory: () => new InMemoryQuoteStore() },
    { provide: CANCELLATION_QUOTE_STORE, useFactory: () => new InMemoryQuoteStore() },
  ],
})
export class PostSaleModule {}
