import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import { MockPaymentApiService, type PaymentVerification } from '@ecoairlines/data-access/external/payment/mock-payment-api.service.js';
import type { PaymentVerifierGateway } from '../../interfaces/bookings/payment-verifier.gateway.js';

/** Gateway de bookings sobre la Payment API simulada. En producción: cliente HTTP de la Payment API real. */
@Injectable()
export class MockPaymentVerifierGateway implements PaymentVerifierGateway {
  constructor(private readonly paymentApi: MockPaymentApiService) {}

  async verify(paymentReference: string, amount: MoneyAmount): Promise<PaymentVerification> {
    return this.paymentApi.verify(paymentReference, amount);
  }

  async markUsed(paymentReference: string, operation: string): Promise<void> {
    this.paymentApi.markUsed(paymentReference, operation);
  }
}
