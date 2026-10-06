import type { ItineraryOption, MoneyAmount } from '../../common/contract/common.types.js';
import type { PassengerCounts } from '../../common/passenger-counts.js';

export type HoldStatus = 'HELD' | 'RELEASED' | 'EXPIRED' | 'CONSUMED';

/** Tarifa elegida para un itinerario de la oferta. */
export interface FareSelection {
  itineraryId: string;
  cabinClass: string;
  fareBrand: string;
}

/** Itinerario elegido con su tarifa, ya cotizado para el grupo de pasajeros. */
export interface PricedSelection extends FareSelection {
  segmentIds: string[];
  /** Itinerario en forma de contrato, con `pricingOptions` limitado a la tarifa elegida. */
  itinerary: ItineraryOption;
  price: MoneyAmount;
}

/** Hold de una oferta. **Base de datos futura: `offers`.** */
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
