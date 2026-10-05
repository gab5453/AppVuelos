export const DEPARTURE_CONTROL_PORT = Symbol('DEPARTURE_CONTROL_PORT');

/**
 * Puerto de **check-in** hacia el control de salidas del GDS (sistema externo): horarios de los vuelos
 * y asignación automática de asiento al hacer check-in. Es propio de check-in.
 */
export interface DepartureControlPort {
  /** Horarios UTC (ms) de un segmento. */
  segmentTimes(segmentId: string): Promise<{ departureUtc: number; arrivalUtc: number } | undefined>;
  /** Asigna el primer asiento libre de la cabina; `undefined` si no queda ninguno. */
  autoAssignSeat(segmentId: string, cabinClass: string, holder: string): Promise<string | undefined>;
}
