import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '../../../common/contract-types/common.types.js';
import type { PaymentVerification } from '../../../common/payments/payment-verification.js';
import { MockPaymentApiService } from '../../../infrastructure/mock-payment/mock-payment-api.service.js';
import type { PostSalePaymentPort } from '../domain/ports/post-sale-payment.port.js';

/** Adapter de post-sale sobre la Payment API simulada. En producción: cliente HTTP de la Payment API real. */
@Injectable()
export class MockPostSalePaymentAdapter implements PostSalePaymentPort {
  constructor(private readonly paymentApi: MockPaymentApiService) {}

  async verify(paymentReference: string, amount: MoneyAmount): Promise<PaymentVerification> {
    return this.paymentApi.verify(paymentReference, amount);
  }

  async markUsed(paymentReference: string, operation: string): Promise<void> {
    this.paymentApi.markUsed(paymentReference, operation);
  }
}
