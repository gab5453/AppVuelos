import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '../../common/contract-types/common.types.js';
import type { PaymentVerification } from '../../common/payments/payment-verification.js';

const REFERENCE_FORMAT = /^pay_[A-Za-z0-9_-]{3,64}$/;

/**
 * Payment API simulada: sistema EXTERNO a todos los dominios (como el GDS). Su estado (referencias ya
 * aplicadas) es único, así un mismo pago no puede usarse en una reserva y en una maleta a la vez.
 * Reglas del mock (documentadas en el README):
 * - formato `pay_<3-64 caracteres alfanuméricos, _ o ->`; otro formato → INVALID;
 * - contiene `declined` → NOT_AUTHORIZED;
 * - contiene `async` → PENDING (la operación continúa de forma asíncrona);
 * - una referencia ya aplicada a otra operación → INVALID.
 * No valida montos: la Payment API real compararía `amount` con lo autorizado (AMOUNT_MISMATCH).
 */
@Injectable()
export class MockPaymentApiService {
  private readonly used = new Map<string, string>();

  verify(paymentReference: string, _amount: MoneyAmount): PaymentVerification {
    if (!REFERENCE_FORMAT.test(paymentReference) || this.used.has(paymentReference)) return 'INVALID';
    if (paymentReference.includes('declined')) return 'NOT_AUTHORIZED';
    if (paymentReference.includes('async')) return 'PENDING';
    return 'AUTHORIZED';
  }

  markUsed(paymentReference: string, operation: string): void {
    this.used.set(paymentReference, operation);
  }
}
