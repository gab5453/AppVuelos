import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '../../../common/contract-types/common.types.js';
import type { PaymentVerification, PaymentVerifierPort } from '../domain/ports/payment-verifier.port.js';

const REFERENCE_FORMAT = /^pay_[A-Za-z0-9_-]{3,64}$/;

/**
 * Payment API simulada. Reglas del mock (documentadas en el README):
 * - formato `pay_<3-64 caracteres alfanuméricos, _ o ->`; otro formato → INVALID;
 * - contiene `declined` → NOT_AUTHORIZED;
 * - contiene `async` → PENDING (la operación continúa de forma asíncrona);
 * - una referencia ya aplicada a otra operación → INVALID (evita cobrar dos reservas con un pago).
 * No valida montos: la Payment API real compararía `amount` con lo autorizado (AMOUNT_MISMATCH).
 */
@Injectable()
export class MockPaymentVerifierAdapter implements PaymentVerifierPort {
  private readonly used = new Map<string, string>();

  async verify(paymentReference: string, _amount: MoneyAmount): Promise<PaymentVerification> {
    if (!REFERENCE_FORMAT.test(paymentReference) || this.used.has(paymentReference)) return 'INVALID';
    if (paymentReference.includes('declined')) return 'NOT_AUTHORIZED';
    if (paymentReference.includes('async')) return 'PENDING';
    return 'AUTHORIZED';
  }

  async markUsed(paymentReference: string, operation: string): Promise<void> {
    this.used.set(paymentReference, operation);
  }
}
