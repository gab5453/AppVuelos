import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import type { SeatInventoryGateway } from '../common/seat-inventory.gateway.js';

export const RESERVATION_SYSTEM_GATEWAY = Symbol('RESERVATION_SYSTEM_GATEWAY');

/**
 * Gateway de **bookings** hacia el GDS: solo lo que necesita para CREAR una reserva (asientos elegidos y
 * precio de las maletas extra compradas en la reserva). Post-sale y check-in tienen sus propios gateways.
 */
export interface ReservationSystemGateway extends SeatInventoryGateway {
  extraBagPrice(itineraryId: string): Promise<MoneyAmount | undefined>;
}
