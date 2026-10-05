import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { BaggageController } from './presentation/baggage.controller.js';
import { DateChangeController } from './presentation/date-change.controller.js';
import { CancellationController } from './presentation/cancellation.controller.js';
import { BaggageService } from './application/baggage.service.js';
import { DateChangeService } from './application/date-change.service.js';
import { CancellationService } from './application/cancellation.service.js';
import { CANCELLATION_QUOTE_STORE, DATE_CHANGE_OFFER_STORE } from './domain/ports/quote-store.port.js';
import { POST_SALE_GDS_PORT } from './domain/ports/post-sale-gds.port.js';
import { POST_SALE_PAYMENT_PORT } from './domain/ports/post-sale-payment.port.js';
import { InMemoryQuoteStore } from './infrastructure/in-memory-quote.store.js';
import { GdsPostSaleAdapter } from './infrastructure/gds-post-sale.adapter.js';
import { MockPostSalePaymentAdapter } from './infrastructure/mock-post-sale-payment.adapter.js';

/**
 * Dominio **post-sale** — dueño de cotizaciones de cancelación y ofertas de cambio (BD futura: `post-sale`).
 * Usa de bookings solo su API pública (`BookingsFacade` y `BookingOwnershipGuard`) y tiene sus propios
 * ports hacia el GDS y la Payment API.
 */
@Module({
  imports: [BookingsModule],
  controllers: [BaggageController, DateChangeController, CancellationController],
  providers: [
    BaggageService,
    DateChangeService,
    CancellationService,
    { provide: DATE_CHANGE_OFFER_STORE, useFactory: () => new InMemoryQuoteStore() },
    { provide: CANCELLATION_QUOTE_STORE, useFactory: () => new InMemoryQuoteStore() },
    { provide: POST_SALE_GDS_PORT, useClass: GdsPostSaleAdapter },
    { provide: POST_SALE_PAYMENT_PORT, useClass: MockPostSalePaymentAdapter },
  ],
})
export class PostSaleModule {}
