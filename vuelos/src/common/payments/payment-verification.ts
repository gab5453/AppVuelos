import { ProblemDetailsException } from '../problem-details/problem-details.exception.js';

/**
 * Resultado de consultar un pago en la Payment API (sistema externo). Cada dominio que recibe
 * `paymentReference` lo consulta con su propio port; este archivo solo comparte el vocabulario.
 * - AUTHORIZED: el pago está autorizado por el monto.
 * - PENDING: la Payment API sigue procesando; la operación continúa de forma asíncrona (202).
 * - INVALID: la referencia no existe o ya se usó en otra operación.
 * - NOT_AUTHORIZED: el pago fue rechazado.
 */
export type PaymentVerification = 'AUTHORIZED' | 'PENDING' | 'INVALID' | 'NOT_AUTHORIZED';

/** ProblemDetails de un pago rechazado. El status depende de lo que documenta cada endpoint (422 en reservas, 409 en posventa). */
export function paymentProblem(verification: 'INVALID' | 'NOT_AUTHORIZED', status: 409 | 422): ProblemDetailsException {
  return verification === 'INVALID'
    ? new ProblemDetailsException({
        status,
        code: 'PAYMENT_REFERENCE_INVALID',
        title: 'La referencia de pago no es válida o ya fue utilizada.',
        invalidParams: [{ name: 'payment.paymentReference', reason: 'invalid or already used' }],
      })
    : new ProblemDetailsException({ status, code: 'PAYMENT_NOT_AUTHORIZED', title: 'El pago no fue autorizado por la Payment API.' });
}
