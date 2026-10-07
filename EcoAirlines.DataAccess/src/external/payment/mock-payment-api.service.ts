import { DatabaseService } from '../../database/database.service.js';
import type { PersistentTable } from '../../database/persistent-table.js';
import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '../../common/contract/common.types.js';

/**
 * Respuesta de la Payment API al consultar un pago (vocabulario del sistema externo).
 * - AUTHORIZED: el pago está autorizado por el monto.
 * - PENDING: la Payment API sigue procesando; la operación continúa de forma asíncrona (202).
 * - INVALID: la referencia no existe o ya se usó en otra operación.
 * - NOT_AUTHORIZED: el pago fue rechazado.
 */
export type PaymentVerification = 'AUTHORIZED' | 'PENDING' | 'INVALID' | 'NOT_AUTHORIZED';

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
  /** Referencias ya usadas (`referencia → operación`). Con `DATABASE_URL` se guardan en el esquema `payment`. */
  private readonly used: PersistentTable<string>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.used = db.table<string>({ schema: 'payment', name: 'used_references' });
  }

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
