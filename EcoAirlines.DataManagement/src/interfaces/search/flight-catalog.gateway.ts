import type { ItineraryOption, MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import type { PassengerCounts } from '@ecoairlines/data-access/common/passenger-counts.js';
import type { GdsSeatMap } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';

export const FLIGHT_CATALOG_GATEWAY = Symbol('FLIGHT_CATALOG_GATEWAY');

export interface SearchLeg {
  origin: string;
  destination: string;
  departureDate: string;
}

/** Oferta del catálogo, con la forma `FlightOffer` del contrato. */
export interface CatalogOffer {
  offerId: string;
  airline: { code?: string; name?: string };
  itineraries: ItineraryOption[];
  grandTotal: MoneyAmount;
}

export interface CatalogSearchResult {
  totalOffers: number;
  offers: CatalogOffer[];
}

/** Gateway de **search** hacia el catálogo del GDS: búsqueda de ofertas y mapa de asientos. */
export interface FlightCatalogGateway {
  search(legs: SearchLeg[], counts: PassengerCounts): Promise<CatalogSearchResult>;
  getSeatMap(offerId: string, segmentId: string): Promise<GdsSeatMap | undefined>;
}
