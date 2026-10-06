import { apiRequest } from './client';
import type { BookingDetail, FlightOperationalStatus, PassengerItem, FlightStatus } from './types';

/*
 * Endpoints PROPIOS de EcoAirlines, fuera del contrato (`contract/ecoairlines-extensions.yaml`): perfil del
 * cliente, cambio de asiento y administración. Se mantienen separados de `endpoints.ts`, que solo cubre el
 * contrato. Los campos son los de la plantilla del grupo de vuelos, para integrarse con el booking.
 */

// ── Perfil del cliente (ecoairlines:profile) ──
export interface CustomerProfileRequest {
  firstName: string;
  lastName: string;
  documentType: 'PASSPORT' | 'NATIONAL_ID';
  documentNumber: string;
  nationality: string;
  documentExpiryDate?: string;
  birthDate: string;
  gender: 'M' | 'F' | 'X';
  contact: { email: string; phone: string };
}

export interface CustomerProfile extends CustomerProfileRequest {
  updatedAt: string;
}

export const getMyProfile = (token: string) => apiRequest<CustomerProfile>('/customers/me', { token }).then((r) => r.data);

export const saveMyProfile = (token: string, body: CustomerProfileRequest) =>
  apiRequest<CustomerProfile>('/customers/me', { method: 'PUT', body, token }).then((r) => r.data);

// ── Cambio de asiento (flights:book) ──
export interface ChangeSeatRequest {
  passengerId?: string;
  newSeatNumber: string;
  segmentId?: string;
}

export interface ChangeSeatResponse {
  bookingId: string;
  passengerId: string;
  seatNumber: string;
  segmentId: string;
  message: string;
}

export const changeSeat = (token: string, bookingId: string, body: ChangeSeatRequest) =>
  apiRequest<ChangeSeatResponse>(`/bookings/${encodeURIComponent(bookingId)}/seat`, { method: 'PUT', body, token }).then((r) => r.data);

// ── Administración (ecoairlines:admin) ──
export interface RouteStat {
  route: string;
  flightsCount: number;
  bookingsCount: number;
  totalRevenue: number;
}

export interface FlightOccupancy {
  flightId: string;
  flightNumber: string;
  route: string;
  scheduledDeparture: string;
  status: FlightOperationalStatus;
  totalSeats: number;
  bookedSeats: number;
  availableSeats: number;
  occupancyPercentage: number;
}

export interface AdminDashboardStats {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  totalPassengers: number;
  totalRevenue: number;
  totalFlightsToday: number;
  routeStats: RouteStat[];
  flightOccupancies: FlightOccupancy[];
  recentBookings: BookingDetail[];
}

export const getDashboardStats = (token: string) =>
  apiRequest<AdminDashboardStats>('/admin/dashboard-stats', { token }).then((r) => r.data);

export const updateFlightStatus = (token: string, flightNumber: string, date: string, status: FlightOperationalStatus) =>
  apiRequest<FlightStatus>(`/admin/flights/${encodeURIComponent(flightNumber)}/status`, {
    method: 'PUT',
    body: { status },
    token,
    query: { date },
  }).then((r) => r.data);

export const getFlightPassengers = (token: string, flightNumber: string, date: string) =>
  apiRequest<PassengerItem[]>(`/admin/flights/${encodeURIComponent(flightNumber)}/passengers`, { token, query: { date } }).then(
    (r) => r.data,
  );

// ── Observabilidad del backend (ecoairlines:admin) ──
type StatusClasses = Record<'2xx' | '3xx' | '4xx' | '5xx', number>;

export interface LatencyStats {
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface ObservabilitySnapshot {
  generatedAt: string;
  startedAt: string;
  uptimeSeconds: number;
  process: { nodeVersion: string; rssMb: number; heapUsedMb: number; heapTotalMb: number };
  totals: { requests: number; statusClasses: StatusClasses; latency: LatencyStats };
  routes: { method: string; route: string; count: number; statusClasses: StatusClasses; latency: LatencyStats }[];
  recentErrors: { at: string; method: string; route: string; status: number; durationMs: number; requestId?: string }[];
}

export const getObservability = (token: string) =>
  apiRequest<ObservabilitySnapshot>('/admin/observability', { token }).then((r) => r.data);
