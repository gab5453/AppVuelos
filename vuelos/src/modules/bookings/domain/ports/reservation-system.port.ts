import type { MoneyAmount } from '../../../../common/contract-types/common.types.js';
import type { SeatInventoryGateway } from '../../../../common/seating/seat-assigner.js';

export const RESERVATION_SYSTEM_PORT = Symbol('RESERVATION_SYSTEM_PORT');

/**
 * Puerto de bookings hacia el GDS (sistema externo): solo lo que necesita para CREAR una reserva
 * (asientos elegidos y precio de las maletas extra compradas en la reserva).
 * Post-sale y check-in tienen sus propios ports hacia el GDS.
 */
export interface ReservationSystemPort extends SeatInventoryGateway {
  extraBagPrice(itineraryId: string): Promise<MoneyAmount | undefined>;
}
