import { Module } from '@nestjs/common';
import { InMemoryIdempotencyStore } from './infrastructure/in-memory-idempotency-store.js';
import { IDEMPOTENCY_STORE_PORT } from './interfaces/idempotency-store.port.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';

@Module({
  providers: [
    { provide: IDEMPOTENCY_STORE_PORT, useClass: InMemoryIdempotencyStore },
    IdempotencyInterceptor,
  ],
  exports: [IDEMPOTENCY_STORE_PORT, IdempotencyInterceptor],
})
export class IdempotencyModule {}
