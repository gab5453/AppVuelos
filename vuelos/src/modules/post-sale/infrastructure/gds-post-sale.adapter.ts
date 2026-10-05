import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '../../../common/contract-types/common.types.js';
import { seatsRequired, type PassengerCounts } from '../../../common/passengers/passenger-counts.js';
import { MockGdsService } from '../../../infrastructure/mock-gds/mock-gds.service.js';
import type { FareConditions, PostSaleGdsPort, PricedItinerary } from '../domain/ports/post-sale-gds.port.js';

/** Adapter de post-sale sobre el GDS simulado. */
@Injectable()
export class GdsPostSaleAdapter implements PostSaleGdsPort {
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
