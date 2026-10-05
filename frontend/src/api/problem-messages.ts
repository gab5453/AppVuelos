import { ApiError } from './client';

/** Mensajes para el usuario por `code` del enum ProblemDetails del contrato. */
const MESSAGES: Record<string, string> = {
  SEAT_TAKEN: 'Ese asiento acaba de ser ocupado. Elige otro, por favor.',
  AMOUNT_MISMATCH: 'El monto del pago no coincide con el de la operación.',
  BOOKING_NOT_CONFIRMED: 'Esta acción requiere una reserva confirmada.',
  BAGGAGE_LIMIT_EXCEEDED: 'Superaste el máximo de maletas extra permitidas.',
  CUTOFF_PASSED: 'El check-in ya cerró para este vuelo (cierra 60 minutos antes de la salida).',
  FARE_NOT_CHANGEABLE: 'Tu tarifa no permite cambios de fecha.',
  FLIGHT_ALREADY_DEPARTED: 'Ese vuelo ya salió.',
  CHANGE_OFFER_EXPIRED: 'La opción de cambio expiró. Vuelve a buscar alternativas.',
  OFFER_NO_LONGER_AVAILABLE: 'La oferta ya no está disponible o se quedó sin cupos. Vuelve a buscar.',
  QUOTE_EXPIRED: 'La cotización expiró. Solicita una nueva.',
  ALREADY_CANCELLED: 'Esta reserva ya fue cancelada.',
  RATE_LIMIT_EXCEEDED: 'Hiciste demasiadas solicitudes seguidas.',
  INFANT_SEAT_NOT_ALLOWED: 'Los infantes viajan en el regazo de un adulto: no pueden tener asiento propio ni superar en número a los adultos.',
  PAYMENT_REFERENCE_INVALID: 'La referencia de pago no es válida o ya fue utilizada.',
  PAYMENT_NOT_AUTHORIZED: 'El pago no fue autorizado. Intenta con otro medio de pago.',
  PNR_CREATION_FAILED: 'No pudimos crear tu reserva. Inténtalo nuevamente.',
  TICKET_ISSUANCE_FAILED: 'No pudimos emitir tus boletos. Inténtalo nuevamente.',
  TICKET_ALREADY_ISSUED: 'Los boletos ya fueron emitidos.',
  CHECK_IN_NOT_AVAILABLE: 'El check-in aún no está disponible (abre 48 horas antes de la salida).',
  CHECK_IN_FAILED: 'No pudimos completar tu check-in.',
  BOARDING_PASS_NOT_AVAILABLE: 'Aún no hay pases de abordar: primero haz el check-in.',
  SEAT_CABIN_MISMATCH: 'El asiento no corresponde a la cabina que compraste.',
  FLIGHT_STATUS_NOT_AVAILABLE: 'No encontramos información de ese vuelo en esa fecha.',
};

/** Mensaje amigable para cualquier error. VALIDATION_FAILED se usa como comodín en el contrato (HALL-05): se usa el título. */
export function friendlyMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado.';
  if (error.status === 0) return error.message;
  if (error.status === 401) return 'Tu sesión expiró o no es válida. Ingresa nuevamente.';
  if (error.status === 403) return 'Tu cuenta no tiene permiso para esta operación.';
  if (error.status >= 500) return 'El servicio no está disponible en este momento. Inténtalo más tarde.';
  const code = error.problem?.code;
  if (code && code !== 'VALIDATION_FAILED' && MESSAGES[code]) return MESSAGES[code];
  return error.problem?.title ?? error.message;
}
