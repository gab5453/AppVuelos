import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';

/**
 * ProblemDetails de un pago rechazado por la Payment API (`PaymentVerification` de EcoAirlines.DataAccess).
 * El status depende de lo que documenta cada endpoint (422 en reservas, 409 en posventa).
 */
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
