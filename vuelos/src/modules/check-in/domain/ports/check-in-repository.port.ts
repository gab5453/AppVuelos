export const CHECK_IN_REPOSITORY_PORT = Symbol('CHECK_IN_REPOSITORY_PORT');

/** Check-in de una reserva por segmento y pasajero; el valor es el asiento (`null` para infantes). */
export type CheckInRecord = Record<string, Record<string, string | null>>;

/**
 * Puerto de persistencia de check-ins. **Base de datos futura: `check-in`** (check-ins por segmento y
 * pasajero; los pases de abordar se derivan de ellos). Antes vivían dentro de la reserva; ahora son
 * datos propios del dominio check-in, referenciados solo por `bookingId`.
 */
export interface CheckInRepositoryPort {
  findByBooking(bookingId: string): Promise<CheckInRecord>;
  save(bookingId: string, record: CheckInRecord): Promise<void>;
}
