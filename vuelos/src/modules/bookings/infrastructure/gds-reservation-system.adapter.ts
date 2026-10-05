import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '../../../common/contract-types/common.types.js';
import { MockGdsService } from '../../../infrastructure/mock-gds/mock-gds.service.js';
import type { ReservationSystemPort } from '../domain/ports/reservation-system.port.js';

/** Adapter de bookings sobre el GDS simulado. */
@Injectable()
export class GdsReservationSystemAdapter implements ReservationSystemPort {
  constructor(private readonly gds: MockGdsService) {}

  async seatInfo(segmentId: string, seatNumber: string) {
    return this.gds.seatInfo(segmentId, seatNumber);
  }

  async assignSeat(segmentId: string, seatNumber: string, holder: string): Promise<boolean> {
    return this.gds.assignSeat(segmentId, seatNumber, holder);
  }

  async releaseSeat(segmentId: string, seatNumber: string, holder: string): Promise<void> {
    this.gds.releaseSeat(segmentId, seatNumber, holder);
  }

  async extraBagPrice(itineraryId: string): Promise<MoneyAmount | undefined> {
    const itinerary = this.gds.resolveItinerary(itineraryId);
    return itinerary && this.gds.extraBagPrice(itinerary);
  }
}
