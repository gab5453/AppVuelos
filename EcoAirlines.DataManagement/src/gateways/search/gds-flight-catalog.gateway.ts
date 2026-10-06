import { Injectable } from '@nestjs/common';
import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import { sumMoney, toCents } from '@ecoairlines/data-access/common/money.js';
import { seatsRequired, type PassengerCounts } from '@ecoairlines/data-access/common/passenger-counts.js';
import { buildOfferId, parseOfferId } from '@ecoairlines/data-access/external/gds/gds-ids.js';
import { MockGdsService, type GdsItinerary, type GdsSeatMap } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';
import { AIRLINE, FARE_BRANDS } from '@ecoairlines/data-access/seed/network.js';
import type {
  CatalogOffer,
  CatalogSearchResult,
  FlightCatalogGateway,
  SearchLeg,
} from '../../interfaces/search/flight-catalog.gateway.js';

const MAX_OFFERS = 20;
/** Tiempo mínimo entre la llegada de un tramo y la salida del siguiente en multidestino / ida y vuelta. */
const MIN_MINUTES_BETWEEN_LEGS = 120;

/** Gateway de search sobre el GDS simulado. Reemplazar por la integración real con el GDS cuando exista. */
@Injectable()
export class GdsFlightCatalogGateway implements FlightCatalogGateway {
  constructor(private readonly gds: MockGdsService) {}

  async search(legs: SearchLeg[], counts: PassengerCounts): Promise<CatalogSearchResult> {
    const optionsPerLeg = legs.map((leg) => this.gds.findItineraries(leg.origin, leg.destination, leg.departureDate));
    if (optionsPerLeg.some((options) => options.length === 0)) {
      return { totalOffers: 0, offers: [] };
    }

    const offers = combineLegs(optionsPerLeg)
      .filter(isChronological)
      .map((itineraries) => this.toOffer(itineraries, counts))
      .filter((offer): offer is CatalogOffer => offer !== undefined)
      .sort((a, b) => toCents(a.grandTotal.total) - toCents(b.grandTotal.total))
      .slice(0, MAX_OFFERS);

    return { totalOffers: offers.length, offers };
  }

  async getSeatMap(offerId: string, segmentId: string): Promise<GdsSeatMap | undefined> {
    const itineraries = parseOfferId(offerId).map((itineraryId) => this.gds.resolveItinerary(itineraryId));
    const belongsToOffer =
      itineraries.every((itinerary) => itinerary !== undefined) &&
      itineraries.some((itinerary) => itinerary!.segments.some((segment) => segment.segmentId === segmentId));
    return belongsToOffer ? this.gds.seatMap(segmentId) : undefined;
  }

  /** `grandTotal` es el precio más bajo disponible para todo el grupo; sin cupo en ninguna tarifa no hay oferta. */
  private toOffer(itineraries: GdsItinerary[], counts: PassengerCounts): CatalogOffer | undefined {
    const totals: MoneyAmount[] = [];
    for (const itinerary of itineraries) {
      const cheapest = FARE_BRANDS.find(
        (fare) => this.gds.availableSeatsForItinerary(itinerary, fare.cabinClass) >= seatsRequired(counts),
      );
      if (!cheapest) return undefined;
      totals.push(this.gds.priceItinerary(itinerary, cheapest, counts));
    }

    return {
      offerId: buildOfferId(itineraries.map((itinerary) => itinerary.itineraryId)),
      airline: { code: AIRLINE.code, name: AIRLINE.name },
      itineraries: itineraries.map((itinerary) => this.gds.toItineraryOption(itinerary, counts)),
      grandTotal: sumMoney(totals),
    };
  }
}

/**
 * Ida y vuelta (≤ 2 tramos): todas las combinaciones. Multidestino (3–6 tramos): se emparejan
 * las opciones por posición para no generar miles de combinaciones.
 */
function combineLegs(optionsPerLeg: GdsItinerary[][]): GdsItinerary[][] {
  if (optionsPerLeg.length <= 2) {
    return optionsPerLeg.reduce<GdsItinerary[][]>(
      (combinations, options) => combinations.flatMap((combination) => options.map((option) => [...combination, option])),
      [[]],
    );
  }
  const size = Math.max(...optionsPerLeg.map((options) => options.length));
  return Array.from({ length: size }, (_, index) => optionsPerLeg.map((options) => options[index % options.length]!));
}

function isChronological(itineraries: GdsItinerary[]): boolean {
  return itineraries.every((itinerary, index) => {
    const previous = itineraries[index - 1];
    return (
      !previous ||
      itinerary.segments[0]!.departureUtc >= previous.segments.at(-1)!.arrivalUtc + MIN_MINUTES_BETWEEN_LEGS * 60_000
    );
  });
}
