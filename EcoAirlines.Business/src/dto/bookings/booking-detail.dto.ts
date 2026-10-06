import type { MoneyAmount, Ticket } from '@ecoairlines/data-access/common/contract/common.types.js';
import type { BookingStatus } from '@ecoairlines/data-access/common/contract/booking.types.js';

export type { BookingDetail as BookingDetailDto, BookingStatus } from '@ecoairlines/data-access/common/contract/booking.types.js';

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
