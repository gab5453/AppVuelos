import type { MoneyAmount, Ticket } from '../../../../common/contract-types/common.types.js';
import type { BookingStatus } from '../../../../common/contract-types/booking.types.js';

export type { BookingDetail as BookingDetailDto, BookingStatus } from '../../../../common/contract-types/booking.types.js';

export interface BookingListItemDto {
  bookingId: string;
  pnr: string;
  status: BookingStatus;
  origin?: string;
  destination?: string;
  departureDate?: string;
  grandTotal: MoneyAmount;
}

export interface BookingListResponseDto {
  nextCursor?: string;
  items: BookingListItemDto[];
}

export interface TicketListResponseDto {
  bookingId: string;
  tickets: Ticket[];
}
