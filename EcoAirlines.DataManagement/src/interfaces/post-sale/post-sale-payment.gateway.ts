import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import type { PaymentVerification } from '@ecoairlines/data-access/external/payment/mock-payment-api.service.js';

export const POST_SALE_PAYMENT_GATEWAY = Symbol('POST_SALE_PAYMENT_GATEWAY');

/** Gateway de **post-sale** hacia la Payment API: cobros de maletas y cambios de fecha. */
export interface PostSalePaymentGateway {
  verify(paymentReference: string, amount: MoneyAmount): Promise<PaymentVerification>;
  markUsed(paymentReference: string, operation: string): Promise<void>;
}
