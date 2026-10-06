import type { HoldRecord } from '@ecoairlines/data-access/entities/offers/hold.entity.js';

export const HOLD_REPOSITORY = Symbol('HOLD_REPOSITORY');

/**
 * Repositorio de holds. **Base de datos futura: `offers`** (holds: oferta, tarifas, pasajeros, precio
 * congelado y estado). Privado de offers; bookings consume holds solo mediante `HoldService`.
 */
export interface HoldRepository {
  create(record: HoldRecord): Promise<HoldRecord>;
  findById(holdId: string): Promise<HoldRecord | undefined>;
  save(record: HoldRecord): Promise<HoldRecord>;
  /** Holds en estado HELD cuyo `expiresAt` ya pasó. */
  findExpired(now: Date): Promise<HoldRecord[]>;
}
