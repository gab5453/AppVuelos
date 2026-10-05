import type { HoldStatus } from '../../presentation/dto/hold-response.dto.js';
import type { MoneyAmount } from '../../../../common/contract-types/common.types.js';
import type { PassengerCounts } from '../../../../common/passengers/passenger-counts.js';
import type { PricedSelection } from './offer-inventory.port.js';

export interface HoldRecord {
  holdId: string;
  /** `sub` del JWT que creó el hold. Dato interno: no forma parte de HoldResponse ni HoldStatusResponse. */
  ownerId: string;
  status: HoldStatus;
  createdAt: Date;
  expiresAt: Date;
  ttlMinutes: number;
  lockedPrice: MoneyAmount;
  offerId: string;
  /** Pasajeros con los defaults de PassengerBreakdown aplicados. */
  counts: PassengerCounts;
  selections: PricedSelection[];
}

export const HOLD_REPOSITORY_PORT = Symbol('HOLD_REPOSITORY_PORT');

/** Puerto de persistencia de holds. Hoy resuelto en memoria; reemplazar por el GDS/DB real. */
export interface HoldRepositoryPort {
  create(record: HoldRecord): Promise<HoldRecord>;
  findById(holdId: string): Promise<HoldRecord | undefined>;
  save(record: HoldRecord): Promise<HoldRecord>;
  /** Holds en estado HELD cuyo `expiresAt` ya pasó. */
  findExpired(now: Date): Promise<HoldRecord[]>;
}
