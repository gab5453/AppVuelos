import type { MoneyAmount } from '../../../../common/contract-types/common.types.js';
import type { PaymentVerification } from '../../../../common/payments/payment-verification.js';

export type { PaymentVerification } from '../../../../common/payments/payment-verification.js';

export const PAYMENT_VERIFIER_PORT = Symbol('PAYMENT_VERIFIER_PORT');

/**
 * Puerto de bookings hacia la Payment API (sistema externo). Esta API NO procesa tarjetas, 3DS,
 * autorización ni captura: solo consulta el estado de un pago ya gestionado por la Payment API.
 */
export interface PaymentVerifierPort {
  verify(paymentReference: string, amount: MoneyAmount): Promise<PaymentVerification>;
  /** Registra que la referencia quedó aplicada a una operación, para que no pueda reutilizarse. */
  markUsed(paymentReference: string, operation: string): Promise<void>;
}
