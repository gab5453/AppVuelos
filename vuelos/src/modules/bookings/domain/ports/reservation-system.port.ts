import type { CabinClass, FlightSegment, ItineraryOption, MoneyAmount } from '../../../../common/contract-types/common.types.js';
import type { PassengerCounts } from '../../../../common/passengers/passenger-counts.js';

export const RESERVATION_SYSTEM_PORT = Symbol('RESERVATION_SYSTEM_PORT');

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
 * Operaciones posventa sobre el GDS: asientos, inventario, horarios y recotización.
 * Lo usan bookings, post-sale y check-in.
 */
export interface ReservationSystemPort {
  seatInfo(segmentId: string, seatNumber: string): Promise<{ cabinClass: CabinClass; isAvailable: boolean; holder?: string } | undefined>;
  assignSeat(segmentId: string, seatNumber: string, holder: string): Promise<boolean>;
  releaseSeat(segmentId: string, seatNumber: string, holder: string): Promise<void>;
  autoAssignSeat(segmentId: string, cabinClass: string, holder: string): Promise<string | undefined>;

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
