import type { MoneyAmount } from '../../../../common/contract-types/common.types.js';
import type { PaymentVerification } from '../../../../common/payments/payment-verification.js';

export const POST_SALE_PAYMENT_PORT = Symbol('POST_SALE_PAYMENT_PORT');

/** Puerto de **post-sale** hacia la Payment API (sistema externo): cobros de maletas y cambios de fecha. */
export interface PostSalePaymentPort {
  verify(paymentReference: string, amount: MoneyAmount): Promise<PaymentVerification>;
  markUsed(paymentReference: string, operation: string): Promise<void>;
}
