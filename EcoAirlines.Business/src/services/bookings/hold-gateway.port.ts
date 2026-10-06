import type { ItineraryOption, MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import type { PassengerCounts } from '@ecoairlines/data-access/common/passenger-counts.js';

export const HOLD_GATEWAY_PORT = Symbol('HOLD_GATEWAY_PORT');

export interface HeldSelection {
  itineraryId: string;
  cabinClass: string;
  fareBrand: string;
  segmentIds: string[];
  itinerary: ItineraryOption;
  price: MoneyAmount;
}

export interface HeldReservation {
  holdId: string;
  counts: PassengerCounts;
  lockedPrice: MoneyAmount;
  selections: HeldSelection[];
}

export type HoldLookup =
  | { ok: true; hold: HeldReservation }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'NOT_HELD' };

/** Puerto hacia el dominio de holds (offers). En microservicios sería un cliente HTTP. */
export interface HoldGatewayPort {
  /** Hold vigente del usuario, sin consumirlo. */
  getHeld(ownerId: string, holdId: string): Promise<HoldLookup>;
  /** Marca el hold como consumido; sus cupos pasan a la reserva. */
  consume(ownerId: string, holdId: string): Promise<HoldLookup>;
}
