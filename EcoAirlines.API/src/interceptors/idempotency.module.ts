import { Module } from '@nestjs/common';
import { DataManagementModule } from '@ecoairlines/data-management/data-management.module.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';

/** El interceptor HTTP vive en la API; las claves se guardan con `IDEMPOTENCY_REPOSITORY` de EcoAirlines.DataManagement. */
@Module({
  imports: [DataManagementModule],
  providers: [IdempotencyInterceptor],
  exports: [IdempotencyInterceptor, DataManagementModule],
})
export class IdempotencyModule {}
