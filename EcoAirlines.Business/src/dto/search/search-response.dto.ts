import type { ItineraryOption, MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';

export interface FlightOfferDto {
  offerId: string;
  airline: { code?: string; name?: string };
  itineraries: ItineraryOption[];
  grandTotal: MoneyAmount;
}

export interface SearchResponseDto {
  totalOffers: number;
  offers: FlightOfferDto[];
}
