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
}

export interface BookingRecord extends BookingDetailDto {
  ownerId: string;
  internal: BookingInternalState;
}

export const BOOKING_REPOSITORY_PORT = Symbol('BOOKING_REPOSITORY_PORT');

/**
 * Puerto de persistencia de reservas. **Base de datos futura: `bookings`** (reserva, pasajeros, tickets,
 * historial y tarifas compradas). Es PRIVADO del dominio bookings: ningún otro dominio lo usa. Los demás
 * leen y modifican reservas solo a través de `BookingsFacade`.
 * Hoy en memoria; reemplazar por PostgreSQL/PNR store sin cambiar controllers ni contrato.
 */
export interface BookingRepositoryPort {
  create(record: BookingRecord): Promise<BookingRecord>;
  findById(bookingId: string): Promise<BookingRecord | undefined>;
  findByPnr(pnr: string): Promise<BookingRecord | undefined>;
  findAllByOwner(ownerId: string): Promise<BookingRecord[]>;
  update(bookingId: string, patch: Partial<BookingRecord>): Promise<BookingRecord>;
}
