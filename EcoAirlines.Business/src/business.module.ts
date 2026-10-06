import { Module } from '@nestjs/common';
import { DataManagementModule } from '@ecoairlines/data-management/data-management.module.js';
import { DeferredTaskRunner } from './common/scheduling/deferred-task-runner.js';
import { WEBHOOK_URL_POLICY, WebhookUrlPolicy } from './rules/webhooks/webhook-url-policy.js';
import { AdminService } from './services/admin/admin.service.js';
import { BookingsFacade } from './services/bookings/bookings.facade.js';
import { BookingsService } from './services/bookings/bookings.service.js';
import { HOLD_GATEWAY_PORT } from './services/bookings/hold-gateway.port.js';
import { OffersHoldGatewayAdapter } from './services/bookings/offers-hold-gateway.adapter.js';
import { SeatChangeService } from './services/bookings/seat-change.service.js';
import { CheckInService } from './services/check-in/check-in.service.js';
import { CustomerProfileService } from './services/customers/customer-profile.service.js';
import { FlightStatusService } from './services/flight-status/flight-status.service.js';
import { HoldService } from './services/offers/hold.service.js';
import { BaggageService } from './services/post-sale/baggage.service.js';
import { CancellationService } from './services/post-sale/cancellation.service.js';
import { DateChangeService } from './services/post-sale/date-change.service.js';
import { CatalogService } from './services/search/catalog.service.js';
import { WebhooksService } from './services/webhooks/webhooks.service.js';

/** Services que usa EcoAirlines.API (sus controllers y el guard de propiedad de reservas). */
const SERVICES = [
  CatalogService,
  HoldService,
  BookingsService,
  BookingsFacade,
  BaggageService,
  DateChangeService,
  CancellationService,
  CheckInService,
  FlightStatusService,
  WebhooksService,
  // extensiones fuera del contrato
  SeatChangeService,
  CustomerProfileService,
  AdminService,
];

/**
 * Capa **EcoAirlines.Business** (equivale a `AddBusiness()` de la plantilla): la lógica de negocio de los
 * 7 dominios del contrato y de las 2 extensiones propias (customers y admin). Solo conoce las interfaces de
 * EcoAirlines.DataManagement, nunca sus implementaciones.
 *
 * Entre dominios solo se usa la API pública: bookings consume holds mediante `HoldService` (a través de
 * `HoldGatewayPort`); post-sale, check-in y admin leen o modifican reservas mediante `BookingsFacade`, y admin
 * cambia el estado de los vuelos mediante `FlightStatusService`. La prueba de arquitectura
 * (`EcoAirlines.API/test/architecture.spec.ts`) lo verifica.
 */
@Module({
  imports: [DataManagementModule],
  providers: [
    ...SERVICES,
    DeferredTaskRunner,
    { provide: HOLD_GATEWAY_PORT, useClass: OffersHoldGatewayAdapter },
    {
      provide: WEBHOOK_URL_POLICY,
      useFactory: () => new WebhookUrlPolicy(process.env.NODE_ENV === 'production'),
    },
  ],
  exports: SERVICES,
})
export class BusinessModule {}
