import type { CheckInRecord } from '@ecoairlines/data-access/entities/check-in/check-in.entity.js';

export const CHECK_IN_REPOSITORY = Symbol('CHECK_IN_REPOSITORY');

/**
 * Repositorio de check-ins. **Base de datos futura: `check-in`** (check-ins por segmento y pasajero; los
 * pases de abordar se derivan de ellos). Datos propios del dominio check-in, referenciados solo por `bookingId`.
 */
export interface CheckInRepository {
  findByBooking(bookingId: string): Promise<CheckInRecord>;
  save(bookingId: string, record: CheckInRecord): Promise<void>;
}
