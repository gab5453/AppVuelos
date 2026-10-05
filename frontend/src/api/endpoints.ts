import { apiRequest } from './client';
import type {
  AddBaggageRequest,
  BaggageAddedResponse,
  BaggageOptionsResponse,
  BoardingPassListResponse,
  BookingDetail,
  BookingListResponse,
  BookingRequest,
  CancelBookingRequest,
  CancellationQuoteResponse,
  CheckInResponse,
  DateChangeRequest,
  DateChangeSearchRequest,
  DateChangeSearchResponse,
  FlightStatus,
  HoldRequest,
  HoldResponse,
  HoldStatusResponse,
  SearchRequest,
  SearchResponse,
  SeatMapResponse,
} from './types';

/** Una función por operación del contrato, con los headers y scopes que cada una exige. */
const seg = encodeURIComponent;

// ── Búsqueda y catálogo (públicos) ──
export const searchFlights = (body: SearchRequest, fingerprint: string) =>
  apiRequest<SearchResponse>('/search', { method: 'POST', body, fingerprint }).then((r) => r.data);

export const getSeatMap = (offerId: string, segmentId: string) =>
  apiRequest<SeatMapResponse>(`/offers/${seg(offerId)}/seatmap`, { query: { segmentId } }).then((r) => r.data);

// ── Hold (flights:hold / flights:read) ──
export const createHold = (token: string, idempotencyKey: string, body: HoldRequest) =>
  apiRequest<HoldResponse>('/offers/hold', { method: 'POST', body, token, idempotencyKey }).then((r) => r.data);

export const getHold = (token: string, holdId: string) =>
  apiRequest<HoldStatusResponse>(`/offers/hold/${seg(holdId)}`, { token }).then((r) => r.data);

export const releaseHold = (token: string, holdId: string) =>
  apiRequest<void>(`/offers/hold/${seg(holdId)}`, { method: 'DELETE', token });

// ── Reservas (flights:book / flights:read) ──
/** Devuelve el status: 201 (tickets emitidos) o 202 (pago/emisión en proceso). */
export const createBooking = (token: string, idempotencyKey: string, body: BookingRequest) =>
  apiRequest<BookingDetail>('/bookings', { method: 'POST', body, token, idempotencyKey });

export const listBookings = (
  token: string,
  query: { pnr?: string; status?: string; createdFrom?: string; createdTo?: string; limit?: number; cursor?: string },
) => apiRequest<BookingListResponse>('/bookings', { token, query }).then((r) => r.data);

export const getBooking = (token: string, bookingId: string) =>
  apiRequest<BookingDetail>(`/bookings/${seg(bookingId)}`, { token }).then((r) => r.data);

// ── Postventa ──
export const getBaggageOptions = (token: string, bookingId: string) =>
  apiRequest<BaggageOptionsResponse>(`/bookings/${seg(bookingId)}/baggage-options`, { token }).then((r) => r.data);

export const addBaggage = (token: string, idempotencyKey: string, bookingId: string, body: AddBaggageRequest) =>
  apiRequest<BaggageAddedResponse | undefined>(`/bookings/${seg(bookingId)}/baggage`, { method: 'POST', body, token, idempotencyKey });

export const searchDateChange = (token: string, bookingId: string, body: DateChangeSearchRequest) =>
  apiRequest<DateChangeSearchResponse>(`/bookings/${seg(bookingId)}/date-change/search`, { method: 'POST', body, token }).then((r) => r.data);

export const confirmDateChange = (token: string, idempotencyKey: string, bookingId: string, body: DateChangeRequest) =>
  apiRequest<BookingDetail | undefined>(`/bookings/${seg(bookingId)}/date-change`, { method: 'POST', body, token, idempotencyKey });

export const getCancellationQuote = (token: string, bookingId: string) =>
  apiRequest<CancellationQuoteResponse>(`/bookings/${seg(bookingId)}/cancellation-quote`, { token }).then((r) => r.data);

export const cancelBooking = (token: string, idempotencyKey: string, bookingId: string, body: CancelBookingRequest) =>
  apiRequest<void>(`/bookings/${seg(bookingId)}/cancel`, { method: 'POST', body, token, idempotencyKey });

// ── Check-in ──
export const checkIn = (token: string, bookingId: string) =>
  apiRequest<CheckInResponse>(`/bookings/${seg(bookingId)}/check-in`, { method: 'POST', token }).then((r) => r.data);

export const getBoardingPasses = (token: string, bookingId: string) =>
  apiRequest<BoardingPassListResponse>(`/bookings/${seg(bookingId)}/boarding-passes`, { token }).then((r) => r.data);

// ── Estado de vuelo (público) ──
export const getFlightStatus = (flightNumber: string, date: string) =>
  apiRequest<FlightStatus>(`/flights/${seg(flightNumber)}/status`, { query: { date } }).then((r) => r.data);
