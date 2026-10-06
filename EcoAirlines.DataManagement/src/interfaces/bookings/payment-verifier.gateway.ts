import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import type { PaymentVerification } from '@ecoairlines/data-access/external/payment/mock-payment-api.service.js';

export const PAYMENT_VERIFIER_GATEWAY = Symbol('PAYMENT_VERIFIER_GATEWAY');

/**
 * Gateway de **bookings** hacia la Payment API (sistema externo). Esta API NO procesa tarjetas, 3DS,
 * autorización ni captura: solo consulta el estado de un pago ya gestionado por la Payment API.
 */
export interface PaymentVerifierGateway {
  verify(paymentReference: string, amount: MoneyAmount): Promise<PaymentVerification>;
  /** Registra que la referencia quedó aplicada a una operación, para que no pueda reutilizarse. */
  markUsed(paymentReference: string, operation: string): Promise<void>;
}
