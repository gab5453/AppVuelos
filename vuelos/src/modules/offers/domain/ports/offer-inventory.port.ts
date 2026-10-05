import type { ItineraryOption, MoneyAmount } from '../../../../common/contract-types/common.types.js';
import type { PassengerCounts } from '../../../../common/passengers/passenger-counts.js';

export const OFFER_INVENTORY_PORT = Symbol('OFFER_INVENTORY_PORT');

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

export type PriceSelectionsResult =
  | { ok: true; selections: PricedSelection[] }
  /** La oferta ya no existe o ya no se vende (vuelo próximo a salir). */
  | { ok: false; reason: 'OFFER_NOT_FOUND' }
  /** Las selecciones no cubren exactamente los itinerarios de la oferta. */
  | { ok: false; reason: 'ITINERARY_MISMATCH' }
  /** Cabina/familia tarifaria inexistente en la oferta. */
  | { ok: false; reason: 'FARE_NOT_OFFERED'; itineraryId: string };

/** Puerto hacia el inventario del GDS: cotizar una oferta y retener/liberar cupos. */
export interface OfferInventoryPort {
  priceSelections(offerId: string, selections: FareSelection[], counts: PassengerCounts): Promise<PriceSelectionsResult>;
  /** Retiene `seats` cupos en todas las selecciones, o en ninguna si alguna no tiene cupo. */
  reserve(selections: PricedSelection[], seats: number): Promise<boolean>;
  release(selections: PricedSelection[], seats: number): Promise<void>;
}
