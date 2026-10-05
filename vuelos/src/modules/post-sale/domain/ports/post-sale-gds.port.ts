import type { FlightSegment, ItineraryOption, MoneyAmount } from '../../../../common/contract-types/common.types.js';
import type { PassengerCounts } from '../../../../common/passengers/passenger-counts.js';
import type { SeatInventoryGateway } from '../../../../common/seating/seat-assigner.js';

export const POST_SALE_GDS_PORT = Symbol('POST_SALE_GDS_PORT');

export interface FareConditions {
  isRefundable: boolean;
  isChangeable: boolean;
  changeFeeUsd: number;
  checkedBaggageIncluded: number;
}

export interface PricedItinerary {
  itineraryId: string;
  segmentIds: string[];
  /** Itinerario en forma de contrato, con `pricingOptions` limitado a la tarifa indicada. */
  itinerary: ItineraryOption;
  segments: FlightSegment[];
  price: MoneyAmount;
}

/**
 * Puerto de **post-sale** hacia el GDS (sistema externo): condiciones de tarifa, horarios, precios de
 * maletas, inventario y asientos para cambios y cancelaciones. Es propio de post-sale; no lo comparte
 * con bookings ni check-in. Al extraer el microservicio, su adaptador pasa a ser el cliente del GDS real.
 */
export interface PostSaleGdsPort extends SeatInventoryGateway {
  reserveInventory(segmentIds: string[], cabinClass: string, seats: number): Promise<boolean>;
  releaseInventory(segmentIds: string[], cabinClass: string, seats: number): Promise<void>;

  /** Horarios UTC (ms) de un segmento. */
  segmentTimes(segmentId: string): Promise<{ departureUtc: number; arrivalUtc: number } | undefined>;
  fareConditions(cabinClass: string, fareBrand: string): Promise<FareConditions | undefined>;
  extraBagPrice(itineraryId: string): Promise<MoneyAmount | undefined>;

  /** Itinerarios alternativos vendibles para una fecha, cotizados en la misma tarifa y con cupo para el grupo. */
  findAlternatives(
    origin: string,
    destination: string,
    localDate: string,
    counts: PassengerCounts,
    fare: { cabinClass: string; fareBrand: string },
  ): Promise<PricedItinerary[]>;
}
