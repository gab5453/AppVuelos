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
  /** Extensiones propias respecto a la plantilla. */
  date: string;
  reservedSeats: number;
  simulatedSeats: number;
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

/** Ocupación de los vuelos por fecha (hoy por defecto), aeropuerto de origen o ruta. */
export const getAdminFlights = (token: string, query: { date?: string; origin?: string; destination?: string }) =>
  apiRequest<FlightOccupancy[]>('/admin/flights', { token, query }).then((r) => r.data);

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

// ── Horario de la flota (ecoairlines:admin) ──
export interface FleetLeg {
  segmentId: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
}

export interface FleetSchedule {
  date: string;
  salesWindow: { from: string; to: string; days: number };
  totalFlights: number;
  aircraft: { registration: string; aircraftType: string; base: string; flights: FleetLeg[] }[];
}

export const getFleetSchedule = (token: string, date: string) =>
  apiRequest<FleetSchedule>('/admin/fleet-schedule', { token, query: { date } }).then((r) => r.data);

// ── Rutas programadas (CRUD del horario, extensión fuera del contrato) ──

export type WeekdayCode = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type AircraftTypeName = 'Airbus A220-300' | 'Airbus A320neo' | 'Boeing 787-9';

export interface ScheduledRouteRequest {
  origin: string;
  destination: string;
  outboundDepartureLocal: string;
  inboundDepartureLocal: string;
  weekdays: WeekdayCode[];
  aircraftType?: AircraftTypeName;
  /** Matrículas elegidas; si se omite, el sistema asigna los aviones. */
  aircraft?: string[];
}

export interface RouteLeg {
  flightNumber: string;
  origin: string;
  destination: string;
  departureLocal: string;
  arrivalLocal: string;
  arrivalDayOffset: number;
}

export interface ScheduledRoute {
  routeId: string;
  origin: string;
  destination: string;
  outbound: RouteLeg;
  inbound: RouteLeg;
  weekdays: WeekdayCode[];
  aircraftType: AircraftTypeName;
  aircraft: string[];
  distanceKm: number;
  durationMinutes: number;
  customerSeats: number;
  source: 'NETWORK' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
}

export const listRoutes = (token: string, airport?: string) =>
  apiRequest<ScheduledRoute[]>('/admin/routes', { token, query: { airport } }).then((r) => r.data);

export const createRoute = (token: string, body: ScheduledRouteRequest) =>
  apiRequest<ScheduledRoute>('/admin/routes', { method: 'POST', body, token }).then((r) => r.data);

export const updateRoute = (token: string, routeId: string, body: ScheduledRouteRequest) =>
  apiRequest<ScheduledRoute>(`/admin/routes/${encodeURIComponent(routeId)}`, { method: 'PUT', body, token }).then((r) => r.data);

export const deleteRoute = (token: string, routeId: string) =>
  apiRequest<void>(`/admin/routes/${encodeURIComponent(routeId)}`, { method: 'DELETE', token }).then(() => undefined);

// ── Eventos de dominio (bus interno y webhooks, ecoairlines:admin) ──

export interface EventDelivery {
  consumer: string;
  target: string;
  outcome: 'DELIVERED' | 'FAILED' | 'SIMULATED';
  httpStatus?: number;
  attempts?: number;
  detail?: string;
}

export interface DomainEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  apiVersion: string;
  data: Record<string, unknown>;
  deliveries: EventDelivery[];
}

export const getRecentEvents = (token: string) =>
  apiRequest<DomainEvent[]>('/admin/events', { token }).then((r) => r.data);

// ── Flota (CRUD de aviones, ecoairlines:admin) ──

export interface Aircraft {
  registration: string;
  aircraftType: AircraftTypeName;
  base: string;
  status: 'IN_SERVICE' | 'AVAILABLE';
  routes: string[];
  totalSeats: number;
  source: 'NETWORK' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
}

export interface AircraftTypeInfo {
  aircraftType: AircraftTypeName;
  registrationPrefix: string;
  seats: { cabinClass: string; seats: number }[];
  totalSeats: number;
  maxRouteKm: number | null;
  turnaroundMinutes: number;
  inFleet: number;
}

export const listAircraftTypes = (token: string) =>
  apiRequest<AircraftTypeInfo[]>('/admin/aircraft-types', { token }).then((r) => r.data);

export const listAircraft = (token: string, filter: { base?: string; aircraftType?: string } = {}) =>
  apiRequest<Aircraft[]>('/admin/aircraft', { token, query: filter }).then((r) => r.data);

export const registerAircraft = (token: string, body: { aircraftType: AircraftTypeName; base: string }) =>
  apiRequest<Aircraft>('/admin/aircraft', { method: 'POST', body, token }).then((r) => r.data);

export const moveAircraft = (token: string, registration: string, base: string) =>
  apiRequest<Aircraft>(`/admin/aircraft/${encodeURIComponent(registration)}`, { method: 'PUT', body: { base }, token }).then((r) => r.data);

export const retireAircraft = (token: string, registration: string) =>
  apiRequest<void>(`/admin/aircraft/${encodeURIComponent(registration)}`, { method: 'DELETE', token }).then(() => undefined);
