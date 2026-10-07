import { Module } from '@nestjs/common';
import { AdminDataContext } from './context/admin.context.js';
import { BookingsDataContext } from './context/bookings.context.js';
import { CheckInDataContext } from './context/check-in.context.js';
import { CustomersDataContext } from './context/customers.context.js';
import { FlightStatusDataContext } from './context/flight-status.context.js';
import { IdempotencyDataContext } from './context/idempotency.context.js';
import { OffersDataContext } from './context/offers.context.js';
import { PostSaleDataContext } from './context/post-sale.context.js';
import { WebhooksDataContext } from './context/webhooks.context.js';
import { DatabaseService } from './database/database.service.js';
import { MockGdsService } from './external/gds/mock-gds.service.js';
import { MockPaymentApiService } from './external/payment/mock-payment-api.service.js';

const DATA_CONTEXTS = [
  OffersDataContext,
  BookingsDataContext,
  PostSaleDataContext,
  CheckInDataContext,
  WebhooksDataContext,
  CustomersDataContext,
  FlightStatusDataContext,
  IdempotencyDataContext,
  AdminDataContext,
];

/**
 * Capa **EcoAirlines.DataAccess** (equivale a `AddDataAccess()` de la plantilla).
 * - Un contexto de datos por base de datos futura: cada dominio es dueño de la suya (V1.A).
 * - Sistemas externos simulados, con una única instancia para toda la aplicación, como ocurriría con
 *   los reales: el GDS (vuelos, cupos y asientos) y la Payment API (pagos y referencias usadas).
 * Solo EcoAirlines.DataManagement usa estos proveedores.
 */
@Module({
  providers: [DatabaseService, ...DATA_CONTEXTS, MockGdsService, MockPaymentApiService],
  exports: [DatabaseService, ...DATA_CONTEXTS, MockGdsService, MockPaymentApiService],
})
export class DataAccessModule {}
