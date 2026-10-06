import { Module } from '@nestjs/common';
import { DataAccessModule } from '@ecoairlines/data-access/data-access.module.js';
import { PostSaleDataContext } from '@ecoairlines/data-access/context/post-sale.context.js';
import { GdsFlightOperationsGateway } from './gateways/admin/gds-flight-operations.gateway.js';
import { GdsReservationSystemGateway } from './gateways/bookings/gds-reservation-system.gateway.js';
import { MockPaymentVerifierGateway } from './gateways/bookings/mock-payment-verifier.gateway.js';
import { GdsDepartureControlGateway } from './gateways/check-in/gds-departure-control.gateway.js';
import { GdsFlightStatusGateway } from './gateways/flight-status/gds-flight-status.gateway.js';
import { GdsOfferInventoryGateway } from './gateways/offers/gds-offer-inventory.gateway.js';
import { GdsPostSaleGateway } from './gateways/post-sale/gds-post-sale.gateway.js';
import { MockPostSalePaymentGateway } from './gateways/post-sale/mock-post-sale-payment.gateway.js';
import { GdsFlightCatalogGateway } from './gateways/search/gds-flight-catalog.gateway.js';
import { HttpWebhookDispatcherGateway } from './gateways/webhooks/http-webhook-dispatcher.gateway.js';
import { NoopWebhookDispatcherGateway } from './gateways/webhooks/noop-webhook-dispatcher.gateway.js';
import { FLIGHT_OPERATIONS_GATEWAY } from './interfaces/admin/flight-operations.gateway.js';
import { BOOKING_REPOSITORY } from './interfaces/bookings/booking.repository.js';
import { PAYMENT_VERIFIER_GATEWAY } from './interfaces/bookings/payment-verifier.gateway.js';
import { RESERVATION_SYSTEM_GATEWAY } from './interfaces/bookings/reservation-system.gateway.js';
import { CHECK_IN_REPOSITORY } from './interfaces/check-in/check-in.repository.js';
import { DEPARTURE_CONTROL_GATEWAY } from './interfaces/check-in/departure-control.gateway.js';
import { CUSTOMER_PROFILE_REPOSITORY } from './interfaces/customers/customer-profile.repository.js';
import { AIRCRAFT_REPOSITORY } from './interfaces/admin/aircraft.repository.js';
import { InMemoryAircraftRepository } from './repositories/admin/in-memory-aircraft.repository.js';
import { SCHEDULED_ROUTE_REPOSITORY } from './interfaces/admin/scheduled-route.repository.js';
import { InMemoryScheduledRouteRepository } from './repositories/admin/in-memory-scheduled-route.repository.js';
import { FLIGHT_STATUS_OVERRIDE_REPOSITORY } from './interfaces/flight-status/flight-status-override.repository.js';
import { FLIGHT_STATUS_GATEWAY } from './interfaces/flight-status/flight-status.gateway.js';
import { IDEMPOTENCY_REPOSITORY } from './interfaces/idempotency/idempotency.repository.js';
import { HOLD_REPOSITORY } from './interfaces/offers/hold.repository.js';
import { OFFER_INVENTORY_GATEWAY } from './interfaces/offers/offer-inventory.gateway.js';
import { POST_SALE_GDS_GATEWAY } from './interfaces/post-sale/post-sale-gds.gateway.js';
import { POST_SALE_PAYMENT_GATEWAY } from './interfaces/post-sale/post-sale-payment.gateway.js';
import { CANCELLATION_QUOTE_REPOSITORY, DATE_CHANGE_OFFER_REPOSITORY } from './interfaces/post-sale/quote.repository.js';
import { FLIGHT_CATALOG_GATEWAY } from './interfaces/search/flight-catalog.gateway.js';
import { WEBHOOK_DISPATCHER_GATEWAY } from './interfaces/webhooks/webhook-dispatcher.gateway.js';
import { WEBHOOK_REPOSITORY } from './interfaces/webhooks/webhook.repository.js';
import { InMemoryBookingRepository } from './repositories/bookings/in-memory-booking.repository.js';
import { InMemoryCheckInRepository } from './repositories/check-in/in-memory-check-in.repository.js';
import { InMemoryCustomerProfileRepository } from './repositories/customers/in-memory-customer-profile.repository.js';
import { InMemoryFlightStatusOverrideRepository } from './repositories/flight-status/in-memory-flight-status-override.repository.js';
import { InMemoryIdempotencyRepository } from './repositories/idempotency/in-memory-idempotency.repository.js';
import { InMemoryHoldRepository } from './repositories/offers/in-memory-hold.repository.js';
import { InMemoryQuoteRepository } from './repositories/post-sale/in-memory-quote.repository.js';
import { InMemoryWebhookRepository } from './repositories/webhooks/in-memory-webhook.repository.js';

/**
 * Capa **EcoAirlines.DataManagement** (equivale a `AddDataManagement()` de la plantilla): enlaza cada
 * interfaz con su implementación. EcoAirlines.Business solo conoce las interfaces (los tokens), así que
 * pasar de memoria a PostgreSQL, o del GDS simulado al real, se hace aquí sin tocar la lógica de negocio.
 */
const PROVIDERS = [
  // search
  { provide: FLIGHT_CATALOG_GATEWAY, useClass: GdsFlightCatalogGateway },
  // offers — BD futura `offers`
  { provide: HOLD_REPOSITORY, useClass: InMemoryHoldRepository },
  { provide: OFFER_INVENTORY_GATEWAY, useClass: GdsOfferInventoryGateway },
  // bookings — BD futura `bookings`
  { provide: BOOKING_REPOSITORY, useClass: InMemoryBookingRepository },
  { provide: RESERVATION_SYSTEM_GATEWAY, useClass: GdsReservationSystemGateway },
  { provide: PAYMENT_VERIFIER_GATEWAY, useClass: MockPaymentVerifierGateway },
  // post-sale — BD futura `post-sale`
  {
    provide: CANCELLATION_QUOTE_REPOSITORY,
    useFactory: (db: PostSaleDataContext) => new InMemoryQuoteRepository(db.cancellationQuotes),
    inject: [PostSaleDataContext],
  },
  {
    provide: DATE_CHANGE_OFFER_REPOSITORY,
    useFactory: (db: PostSaleDataContext) => new InMemoryQuoteRepository(db.dateChangeOffers),
    inject: [PostSaleDataContext],
  },
  { provide: POST_SALE_GDS_GATEWAY, useClass: GdsPostSaleGateway },
  { provide: POST_SALE_PAYMENT_GATEWAY, useClass: MockPostSalePaymentGateway },
  // check-in — BD futura `check-in`
  { provide: CHECK_IN_REPOSITORY, useClass: InMemoryCheckInRepository },
  { provide: DEPARTURE_CONTROL_GATEWAY, useClass: GdsDepartureControlGateway },
  // flight-status — BD futura `flight-status` (ajustes operativos)
  { provide: FLIGHT_STATUS_GATEWAY, useClass: GdsFlightStatusGateway },
  { provide: FLIGHT_STATUS_OVERRIDE_REPOSITORY, useClass: InMemoryFlightStatusOverrideRepository },
  { provide: SCHEDULED_ROUTE_REPOSITORY, useClass: InMemoryScheduledRouteRepository },
  { provide: AIRCRAFT_REPOSITORY, useClass: InMemoryAircraftRepository },
  // customers — BD futura `customers` (extensión fuera del contrato)
  { provide: CUSTOMER_PROFILE_REPOSITORY, useClass: InMemoryCustomerProfileRepository },
  // admin — sin datos propios (extensión fuera del contrato)
  { provide: FLIGHT_OPERATIONS_GATEWAY, useClass: GdsFlightOperationsGateway },
  // webhooks — BD futura `webhooks`
  { provide: WEBHOOK_REPOSITORY, useClass: InMemoryWebhookRepository },
  {
    provide: WEBHOOK_DISPATCHER_GATEWAY,
    // WEBHOOK_DELIVERY=http envía de verdad; =log solo registra. Por defecto: log en pruebas, http en los demás entornos.
    useFactory: () =>
      (process.env.WEBHOOK_DELIVERY ?? (process.env.NODE_ENV === 'test' ? 'log' : 'http')) === 'http'
        ? new HttpWebhookDispatcherGateway()
        : new NoopWebhookDispatcherGateway(),
  },
  // transversal
  { provide: IDEMPOTENCY_REPOSITORY, useClass: InMemoryIdempotencyRepository },
];

@Module({
  imports: [DataAccessModule],
  providers: PROVIDERS,
  exports: PROVIDERS.map((provider) => provider.provide),
})
export class DataManagementModule {}
