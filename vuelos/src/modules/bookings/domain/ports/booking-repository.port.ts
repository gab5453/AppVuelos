import type { MoneyAmount } from '../../../../common/contract-types/common.types.js';
import type { PassengerCounts } from '../../../../common/passengers/passenger-counts.js';
import type { BookingDetailDto } from '../../presentation/dto/booking-detail.dto.js';

/** Tarifa comprada para un itinerario de la reserva. */
export interface PurchasedFare {
  itineraryId: string;
  cabinClass: string;
  fareBrand: string;
  segmentIds: string[];
  /** Precio del itinerario para todo el grupo (sin maletas extra). */
  price: MoneyAmount;
}

/** Estado interno de la reserva. Nunca se expone: no forma parte de BookingDetail. */
export interface BookingInternalState {
  holdId: string;
  counts: PassengerCounts;
  fares: PurchasedFare[];
  /** Check-in por segmento y pasajero; el valor es el asiento (`null` para infantes). */
  checkIns: Record<string, Record<string, string | null>>;
}

export interface BookingRecord extends BookingDetailDto {
  ownerId: string;
  internal: BookingInternalState;
}

export const BOOKING_REPOSITORY_PORT = Symbol('BOOKING_REPOSITORY_PORT');

/** Puerto de persistencia de reservas. Hoy en memoria; reemplazar por el PNR store/GDS real. */
export interface BookingRepositoryPort {
  create(record: BookingRecord): Promise<BookingRecord>;
  findById(bookingId: string): Promise<BookingRecord | undefined>;
  findByPnr(pnr: string): Promise<BookingRecord | undefined>;
  findAllByOwner(ownerId: string): Promise<BookingRecord[]>;
  update(bookingId: string, patch: Partial<BookingRecord>): Promise<BookingRecord>;
}
