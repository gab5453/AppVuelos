import type { MoneyAmount } from '../../../../common/contract-types/common.types.js';

export const PAYMENT_VERIFIER_PORT = Symbol('PAYMENT_VERIFIER_PORT');

/**
 * - AUTHORIZED: el pago está autorizado por el monto.
 * - PENDING: la Payment API sigue procesando; la operación continúa de forma asíncrona (202).
 * - INVALID: la referencia no existe o ya se usó en otra operación.
 * - NOT_AUTHORIZED: el pago fue rechazado.
 */
export type PaymentVerification = 'AUTHORIZED' | 'PENDING' | 'INVALID' | 'NOT_AUTHORIZED';

/**
 * Puerto hacia la Payment API. Esta API NO procesa tarjetas, 3DS, autorización ni captura:
 * solo consulta el estado de un pago ya gestionado por la Payment API.
 */
export interface PaymentVerifierPort {
  verify(paymentReference: string, amount: MoneyAmount): Promise<PaymentVerification>;
  /** Registra que la referencia quedó aplicada a una operación, para que no pueda reutilizarse. */
  markUsed(paymentReference: string, operation: string): Promise<void>;
}
