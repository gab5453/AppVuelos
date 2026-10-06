import { Module } from '@nestjs/common';
import { BusinessModule } from '@ecoairlines/business/business.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminController } from './controllers/admin/admin.controller.js';
import { ObservabilityController } from './controllers/admin/observability.controller.js';
import { BookingOwnershipGuard } from './controllers/bookings/booking-ownership.guard.js';
import { BookingsController } from './controllers/bookings/bookings.controller.js';
import { SeatChangeController } from './controllers/bookings/seat-change.controller.js';
import { TicketsController } from './controllers/bookings/tickets.controller.js';
import { CheckInController } from './controllers/check-in/check-in.controller.js';
import { CustomerProfileController } from './controllers/customers/customer-profile.controller.js';
import { FlightStatusController } from './controllers/flight-status/flight-status.controller.js';
import { HoldController } from './controllers/offers/hold.controller.js';
import { BaggageController } from './controllers/post-sale/baggage.controller.js';
import { CancellationController } from './controllers/post-sale/cancellation.controller.js';
import { DateChangeController } from './controllers/post-sale/date-change.controller.js';
import { DeviceFingerprintGuard } from './controllers/search/device-fingerprint.guard.js';
import { SearchController } from './controllers/search/search.controller.js';
import { SeatMapController } from './controllers/search/seatmap.controller.js';
import { WebhooksController } from './controllers/webhooks/webhooks.controller.js';
import { IdempotencyModule } from './interceptors/idempotency.module.js';
import { HttpMetricsStore } from './observability/http-metrics.store.js';
import { SecurityModule } from './security/security.module.js';

/**
 * Módulo raíz de **EcoAirlines.API** (equivale a `Program.cs` de la plantilla). Arma la solución:
 * - BusinessModule → DataManagementModule → DataAccessModule (las capas inferiores);
 * - autenticación OAuth2/JWT, idempotencia y límite de peticiones (transversales a la API);
 * - los controllers REST de los 7 dominios del contrato, en el mismo orden de registro que antes, y al final
 *   los de las extensiones propias (cambio de asiento, perfil del cliente, administración y observabilidad).
 */
@Module({
  imports: [BusinessModule, AuthModule, IdempotencyModule, SecurityModule],
  controllers: [
    // search
    SearchController,
    SeatMapController,
    // offers
    HoldController,
    // bookings
    BookingsController,
    TicketsController,
    // post-sale
    BaggageController,
    DateChangeController,
    CancellationController,
    // check-in
    CheckInController,
    // flight-status
    FlightStatusController,
    // webhooks
    WebhooksController,
    // extensiones fuera del contrato (contract/ecoairlines-extensions.yaml)
    SeatChangeController,
    CustomerProfileController,
    AdminController,
    ObservabilityController,
  ],
  providers: [DeviceFingerprintGuard, BookingOwnershipGuard, HttpMetricsStore],
})
export class AppModule {}
