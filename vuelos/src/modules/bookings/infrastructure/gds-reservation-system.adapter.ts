import { Injectable } from '@nestjs/common';
import type { CabinClass, MoneyAmount } from '../../../common/contract-types/common.types.js';
import { seatsRequired, type PassengerCounts } from '../../../common/passengers/passenger-counts.js';
import { MockGdsService } from '../../../infrastructure/mock-gds/mock-gds.service.js';
import type { FareConditions, PricedItinerary, ReservationSystemPort } from '../domain/ports/reservation-system.port.js';

/** Adapter sobre el GDS simulado. */
@Injectable()
export class GdsReservationSystemAdapter implements ReservationSystemPort {
  constructor(private readonly gds: MockGdsService) {}

  async seatInfo(segmentId: string, seatNumber: string): Promise<{ cabinClass: CabinClass; isAvailable: boolean; holder?: string } | undefined> {
    return this.gds.seatInfo(segmentId, seatNumber);
  }

  async assignSeat(segmentId: string, seatNumber: string, holder: string): Promise<boolean> {
    return this.gds.assignSeat(segmentId, seatNumber, holder);
  }

  async releaseSeat(segmentId: string, seatNumber: string, holder: string): Promise<void> {
    this.gds.releaseSeat(segmentId, seatNumber, holder);
  }

  async autoAssignSeat(segmentId: string, cabinClass: string, holder: string): Promise<string | undefined> {
    const seat = this.gds.firstAvailableSeat(segmentId, cabinClass);
    return seat && this.gds.assignSeat(segmentId, seat, holder) ? seat : undefined;
  }

  async reserveInventory(segmentIds: string[], cabinClass: string, seats: number): Promise<boolean> {
    return this.gds.reserve(segmentIds, cabinClass, seats);
  }

  async releaseInventory(segmentIds: string[], cabinClass: string, seats: number): Promise<void> {
    this.gds.release(segmentIds, cabinClass, seats);
  }

  async segmentTimes(segmentId: string): Promise<{ departureUtc: number; arrivalUtc: number } | undefined> {
    const segment = this.gds.resolveSegment(segmentId);
    return segment && { departureUtc: segment.departureUtc, arrivalUtc: segment.arrivalUtc };
  }

  async fareConditions(cabinClass: string, fareBrand: string): Promise<FareConditions | undefined> {
    const fare = this.gds.findFare(cabinClass, fareBrand);
    return (
      fare && {
        isRefundable: fare.isRefundable,
        isChangeable: fare.isChangeable,
        changeFeeUsd: fare.changeFeeUsd,
        checkedBaggageIncluded: fare.checkedBaggageIncluded,
      }
    );
  }

  async extraBagPrice(itineraryId: string): Promise<MoneyAmount | undefined> {
    const itinerary = this.gds.resolveItinerary(itineraryId);
    return itinerary && this.gds.extraBagPrice(itinerary);
  }

  async findAlternatives(
    origin: string,
    destination: string,
    localDate: string,
    counts: PassengerCounts,
    selected: { cabinClass: string; fareBrand: string },
  ): Promise<PricedItinerary[]> {
    const fare = this.gds.findFare(selected.cabinClass, selected.fareBrand);
    if (!fare) return [];
    return this.gds
      .findItineraries(origin, destination, localDate)
      .filter((itinerary) => this.gds.availableSeatsForItinerary(itinerary, fare.cabinClass) >= seatsRequired(counts))
      .map((itinerary) => {
        const option = this.gds.toItineraryOption(itinerary, counts, selected);
        return {
          itineraryId: itinerary.itineraryId,
          segmentIds: itinerary.segments.map((segment) => segment.segmentId),
          itinerary: option,
          segments: option.segments,
          price: this.gds.priceItinerary(itinerary, fare, counts),
        };
      });
  }
}
