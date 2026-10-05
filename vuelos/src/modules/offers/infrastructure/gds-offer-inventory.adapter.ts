import { Injectable } from '@nestjs/common';
import type { PassengerCounts } from '../../../common/passengers/passenger-counts.js';
import { parseOfferId } from '../../../infrastructure/mock-gds/gds-ids.js';
import { MockGdsService } from '../../../infrastructure/mock-gds/mock-gds.service.js';
import type {
  FareSelection,
  OfferInventoryPort,
  PricedSelection,
  PriceSelectionsResult,
} from '../domain/ports/offer-inventory.port.js';

/** Adapter sobre el GDS simulado. */
@Injectable()
export class GdsOfferInventoryAdapter implements OfferInventoryPort {
  constructor(private readonly gds: MockGdsService) {}

  async priceSelections(offerId: string, selections: FareSelection[], counts: PassengerCounts): Promise<PriceSelectionsResult> {
    const itineraryIds = parseOfferId(offerId);
    const itineraries = itineraryIds.map((itineraryId) => this.gds.resolveItinerary(itineraryId));
    if (itineraries.some((itinerary) => !itinerary || !this.gds.isSellable(itinerary))) {
      return { ok: false, reason: 'OFFER_NOT_FOUND' };
    }

    const selected = selections.map((selection) => selection.itineraryId);
    const coversOffer =
      selected.length === itineraryIds.length &&
      new Set(selected).size === selected.length &&
      itineraryIds.every((itineraryId) => selected.includes(itineraryId));
    if (!coversOffer) {
      return { ok: false, reason: 'ITINERARY_MISMATCH' };
    }

    const priced: PricedSelection[] = [];
    for (const selection of selections) {
      const itinerary = itineraries.find((candidate) => candidate!.itineraryId === selection.itineraryId)!;
      const fare = this.gds.findFare(selection.cabinClass, selection.fareBrand);
      if (!fare) {
        return { ok: false, reason: 'FARE_NOT_OFFERED', itineraryId: selection.itineraryId };
      }
      priced.push({
        ...selection,
        segmentIds: itinerary.segments.map((segment) => segment.segmentId),
        itinerary: this.gds.toItineraryOption(itinerary, counts, selection),
        price: this.gds.priceItinerary(itinerary, fare, counts),
      });
    }
    return { ok: true, selections: priced };
  }

  async reserve(selections: PricedSelection[], seats: number): Promise<boolean> {
    const done: PricedSelection[] = [];
    for (const selection of selections) {
      if (!this.gds.reserve(selection.segmentIds, selection.cabinClass, seats)) {
        await this.release(done, seats);
        return false;
      }
      done.push(selection);
    }
    return true;
  }

  async release(selections: PricedSelection[], seats: number): Promise<void> {
    for (const selection of selections) {
      this.gds.release(selection.segmentIds, selection.cabinClass, seats);
    }
  }
}
