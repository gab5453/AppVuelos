import type { ItineraryOption, MoneyAmount } from '../../../../common/contract-types/common.types.js';

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
