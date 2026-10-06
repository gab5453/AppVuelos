import type { BookingDetail } from '../../common/contract/booking.types.js';
import type { MoneyAmount } from '../../common/contract/common.types.js';
import type { PassengerCounts } from '../../common/passenger-counts.js';

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

/**
 * Reserva: pasajeros, asientos, maletas, tickets, historial y tarifas compradas.
 * **Base de datos futura: `bookings`.**
 */
export interface BookingRecord extends BookingDetail {
  ownerId: string;
  internal: BookingInternalState;
}
