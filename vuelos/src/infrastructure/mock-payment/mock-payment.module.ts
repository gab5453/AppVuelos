import { Global, Module } from '@nestjs/common';
import { MockPaymentApiService } from './mock-payment-api.service.js';

/**
 * Sistema externo simulado (Payment API). Global para que todos los adaptadores consulten la misma
 * instancia, como ocurriría con la API real. Solo los adaptadores de `infrastructure/` lo usan.
 */
@Global()
@Module({
  providers: [MockPaymentApiService],
  exports: [MockPaymentApiService],
})
export class MockPaymentModule {}
