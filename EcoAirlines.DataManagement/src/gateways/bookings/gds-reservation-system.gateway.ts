import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import { MockGdsService } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';
import type { ReservationSystemGateway } from '../../interfaces/bookings/reservation-system.gateway.js';

/** Gateway de bookings sobre el GDS simulado. */
@Injectable()
export class GdsReservationSystemGateway implements ReservationSystemGateway {
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
