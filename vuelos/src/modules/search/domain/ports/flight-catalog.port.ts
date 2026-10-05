import type { PassengerCounts } from '../../../../common/passengers/passenger-counts.js';
import type { SearchResponseDto } from '../../presentation/dto/search-response.dto.js';
import type { SeatMapResponseDto } from '../../presentation/dto/seatmap-response.dto.js';

export const FLIGHT_CATALOG_PORT = Symbol('FLIGHT_CATALOG_PORT');

export interface SearchLeg {
  origin: string;
  destination: string;
  departureDate: string;
}

/** Puerto hacia el catálogo/GDS real. Hoy resuelto por un adapter sobre el GDS simulado. */
export interface FlightCatalogPort {
  search(legs: SearchLeg[], counts: PassengerCounts): Promise<SearchResponseDto>;
  getSeatMap(offerId: string, segmentId: string): Promise<SeatMapResponseDto | undefined>;
}
