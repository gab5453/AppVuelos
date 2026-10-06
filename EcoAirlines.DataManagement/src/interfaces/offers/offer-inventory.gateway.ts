import type { PassengerCounts } from '@ecoairlines/data-access/common/passenger-counts.js';
import type { FareSelection, PricedSelection } from '@ecoairlines/data-access/entities/offers/hold.entity.js';

export const OFFER_INVENTORY_GATEWAY = Symbol('OFFER_INVENTORY_GATEWAY');

export type PriceSelectionsResult =
  | { ok: true; selections: PricedSelection[] }
  /** La oferta ya no existe o ya no se vende (vuelo próximo a salir). */
  | { ok: false; reason: 'OFFER_NOT_FOUND' }
  /** Las selecciones no cubren exactamente los itinerarios de la oferta. */
  | { ok: false; reason: 'ITINERARY_MISMATCH' }
  /** Cabina/familia tarifaria inexistente en la oferta. */
  | { ok: false; reason: 'FARE_NOT_OFFERED'; itineraryId: string };

/** Gateway de **offers** hacia el inventario del GDS: cotizar una oferta y retener/liberar cupos. */
export interface OfferInventoryGateway {
  priceSelections(offerId: string, selections: FareSelection[], counts: PassengerCounts): Promise<PriceSelectionsResult>;
  /** Retiene `seats` cupos en todas las selecciones, o en ninguna si alguna no tiene cupo. */
  reserve(selections: PricedSelection[], seats: number): Promise<boolean>;
  release(selections: PricedSelection[], seats: number): Promise<void>;
}
