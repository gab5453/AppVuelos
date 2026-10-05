import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { MockGdsModule } from './infrastructure/mock-gds/mock-gds.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { OffersModule } from './modules/offers/offers.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { PostSaleModule } from './modules/post-sale/post-sale.module.js';
import { CheckInModule } from './modules/check-in/check-in.module.js';
import { FlightStatusModule } from './modules/flight-status/flight-status.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';

@Module({
  imports: [
    CommonModule,
    MockGdsModule,
    SearchModule,
    OffersModule,
    BookingsModule,
    PostSaleModule,
    CheckInModule,
    FlightStatusModule,
    WebhooksModule,
  ],
})
export class AppModule {}
