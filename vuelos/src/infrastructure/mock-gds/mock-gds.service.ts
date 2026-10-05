import { Injectable } from '@nestjs/common';
import type {
  CabinClass,
  FlightOperationalStatus,
  FlightSegment,
  ItineraryOption,
  MoneyAmount,
  PassengerType,
} from '../../common/contract-types/common.types.js';
import { moneyFromCents, sumMoney, scaleMoney } from '../../common/money/money.js';
import { countsByType, type PassengerCounts } from '../../common/passengers/passenger-counts.js';
import { AIRPORTS, distanceKm, type Airport } from './airports.js';
import {
  addDays,
  buildItineraryId,
  buildSegmentId,
  formatLocalIso,
  localDateOf,
  localToUtcMs,
  parseItineraryId,
  parseSegmentId,
} from './gds-ids.js';
import { stableHash } from '../../common/hash/stable-hash.js';
import {
  AIRCRAFT,
  AIRLINE,
  FARE_BRANDS,
  SCHEDULE,
  TERMINALS,
  type FareBrandDefinition,
  type ScheduledFlight,
} from './network.js';

export interface GdsSegment {
  segmentId: string;
  flight: ScheduledFlight;
  origin: Airport;
  destination: Airport;
  /** Fecha local de salida en el origen. */
  localDate: string;
  departureUtc: number;
  arrivalUtc: number;
  durationMinutes: number;
  distanceKm: number;
}

export interface GdsItinerary {
  itineraryId: string;
  segments: GdsSegment[];
  totalDurationMinutes: number;
  distanceKm: number;
}

export interface GdsSeat {
  seatNumber: string;
  cabinClass: CabinClass;
  rowNumber: number;
  characteristics: ('WINDOW' | 'AISLE' | 'EXTRA_LEGROOM' | 'EMERGENCY_EXIT')[];
}

export interface GdsSeatMap {
  segmentId: string;
  cabins: {
    cabinClass: string;
    rows: { rowNumber: number; seats: { seatNumber: string; isAvailable: boolean; characteristics: GdsSeat['characteristics'] }[] }[];
  }[];
}

interface FlightEndpointStatus {
  iataCode: string;
  terminal: string | null;
  scheduledAt: string;
  estimatedAt: string | null;
  actualAt: string | null;
}

export interface GdsFlightStatus {
  flightNumber: string;
  date: string;
  marketingCarrier: string;
  operatingCarrier: string;
  departure: FlightEndpointStatus;
  arrival: FlightEndpointStatus;
  aircraft: string | null;
  status: FlightOperationalStatus;
}

const MIN_LAYOVER_MINUTES = 60;
const MAX_LAYOVER_MINUTES = 600;
const MAX_DETOUR_FACTOR = 1.6;
const MAX_OPTIONS_PER_ROUTE = 6;
/** No se venden vuelos que salen en menos de este tiempo. */
const MIN_SALE_LEAD_MINUTES = 60;
const BOARDING_STARTS_MINUTES = 40;
const STATUS_WINDOW_DAYS = 370;

const PASSENGER_FARE_FACTOR: Record<PassengerType, number> = { ADULT: 1, YOUTH: 1, CHILD: 0.75, INFANT: 0.1 };

/**
 * GDS simulado en memoria, compartido por los adaptadores mock de search, offers, bookings,
 * check-in y flight-status. Todo es determinista salvo el estado mutable de inventario
 * (cupos retenidos/vendidos) y asientos asignados.
 * En producción cada adaptador se reemplaza por la integración real; los dominios no cambian.
 */
@Injectable()
export class MockGdsService {
  /** Cupos retenidos o vendidos por `segmentId|cabina`. */
  private readonly reserved = new Map<string, number>();
  /** Asientos asignados: segmentId → asiento → titular. */
  private readonly assignedSeats = new Map<string, Map<string, string>>();
  private readonly seatLayoutCache = new Map<string, GdsSeat[]>();

  /** Reloj reemplazable en pruebas. */
  now: () => number = () => Date.now();

  // ───────────────────────── segmentos e itinerarios ─────────────────────────

  resolveSegment(segmentId: string): GdsSegment | undefined {
    const parsed = parseSegmentId(segmentId);
    const flight = parsed && SCHEDULE.find((candidate) => candidate.flightNumber === parsed.flightNumber);
    return parsed && flight ? this.buildSegment(flight, parsed.localDate) : undefined;
  }

  /** Itinerarios directos y con una escala para una fecha local de salida, ordenados por paradas y duración. */
  findItineraries(origin: string, destination: string, localDate: string): GdsItinerary[] {
    if (!AIRPORTS[origin] || !AIRPORTS[destination] || origin === destination) {
      return [];
    }
    const earliestDeparture = this.now() + MIN_SALE_LEAD_MINUTES * 60_000;
    const options: GdsSegment[][] = [];

    for (const first of this.segmentsDeparting(origin, localDate)) {
      if (first.departureUtc < earliestDeparture) continue;
      if (first.destination.code === destination) {
        options.push([first]);
        continue;
      }
      const hub = first.destination;
      const arrivalDate = localDateOf(first.arrivalUtc, hub.utcOffsetMinutes);
      for (const date of [arrivalDate, addDays(arrivalDate, 1)]) {
        for (const second of this.segmentsDeparting(hub.code, date, destination)) {
          if (isValidConnection(first, second)) options.push([first, second]);
        }
      }
    }

    return options
      .map((segments) => toItinerary(segments))
      .sort((a, b) => a.segments.length - b.segments.length || a.totalDurationMinutes - b.totalDurationMinutes)
      .slice(0, MAX_OPTIONS_PER_ROUTE);
  }

  /** Reconstruye un itinerario a partir de su id; `undefined` si no es una combinación válida de la red. */
  resolveItinerary(itineraryId: string): GdsItinerary | undefined {
    const segmentIds = parseItineraryId(itineraryId);
    if (segmentIds.length < 1 || segmentIds.length > 2) return undefined;
    const segments = segmentIds.map((segmentId) => this.resolveSegment(segmentId));
    if (segments.some((segment) => !segment)) return undefined;
    const resolved = segments as GdsSegment[];
    if (resolved.length === 2 && !isValidConnection(resolved[0]!, resolved[1]!)) return undefined;
    return toItinerary(resolved);
  }

  hasDeparted(segment: GdsSegment): boolean {
    return segment.departureUtc <= this.now();
  }

  isSellable(itinerary: GdsItinerary): boolean {
    return itinerary.segments[0]!.departureUtc >= this.now() + MIN_SALE_LEAD_MINUTES * 60_000;
  }

  // ───────────────────────── tarifas ─────────────────────────

  findFare(cabinClass: string, fareBrand: string): FareBrandDefinition | undefined {
    return FARE_BRANDS.find((fare) => fare.cabinClass === cabinClass && fare.fareBrand === fareBrand);
  }

  /** Precio de un pasajero de un tipo para un itinerario y familia tarifaria. */
  priceFor(itinerary: GdsItinerary, fare: FareBrandDefinition, passengerType: PassengerType): MoneyAmount {
    const connectionDiscount = itinerary.segments.length > 1 ? 0.9 : 1;
    const routeBase = itinerary.segments.reduce((total, segment) => total + 35 + segment.distanceKm * 0.085, 0);
    const adultBaseCents = Math.round(routeBase * connectionDiscount * fare.multiplier) * 100;
    const baseCents = Math.round((adultBaseCents * PASSENGER_FARE_FACTOR[passengerType]) / 100) * 100;
    const taxesCents =
      passengerType === 'INFANT' ? 0 : Math.round(adultBaseCents * 0.15) + 1_200 * itinerary.segments.length;
    return moneyFromCents(baseCents, taxesCents);
  }

  /** Total para un grupo de pasajeros. */
  priceItinerary(itinerary: GdsItinerary, fare: FareBrandDefinition, counts: PassengerCounts): MoneyAmount {
    return sumMoney(
      countsByType(counts).map(([type, count]) => scaleMoney(this.priceFor(itinerary, fare, type), count)),
    );
  }

  extraBagPrice(itinerary: GdsItinerary): MoneyAmount {
    const usd = itinerary.distanceKm < 1_000 ? 35 : itinerary.distanceKm < 3_000 ? 45 : 60;
    return moneyFromCents(usd * 100, 0);
  }

  /**
   * Itinerario en la forma `ItineraryOption` del contrato. Con `only` se limita `pricingOptions`
   * a la tarifa comprada (detalle de una reserva).
   */
  toItineraryOption(
    itinerary: GdsItinerary,
    counts: PassengerCounts,
    only?: { cabinClass: string; fareBrand: string },
  ): ItineraryOption {
    const fares = only
      ? FARE_BRANDS.filter((fare) => fare.cabinClass === only.cabinClass && fare.fareBrand === only.fareBrand)
      : FARE_BRANDS;
    return {
      itineraryId: itinerary.itineraryId,
      totalDurationMinutes: itinerary.totalDurationMinutes,
      stopsCount: itinerary.segments.length - 1,
      segments: itinerary.segments.map((segment, index) => this.toFlightSegment(segment, itinerary.segments[index + 1])),
      pricingOptions: fares.map((fare) => ({
        cabinClass: fare.cabinClass,
        fareBrand: fare.fareBrand,
        availableSeats: this.availableSeatsForItinerary(itinerary, fare.cabinClass),
        fareRules: { isRefundable: fare.isRefundable, isChangeable: fare.isChangeable },
        baggageAllowance: {
          personalItemIncluded: fare.personalItemIncluded,
          carryOnIncluded: fare.carryOnIncluded,
          checkedBaggageIncluded: fare.checkedBaggageIncluded,
        },
        extraCheckedBaggagePrice: this.extraBagPrice(itinerary),
        pricePerPassengerType: countsByType(counts).map(([passengerType]) => ({
          passengerType,
          price: this.priceFor(itinerary, fare, passengerType),
        })),
      })),
    };
  }

  /** `layoverMinutes` se informa en el segmento tras el cual ocurre la escala. */
  toFlightSegment(segment: GdsSegment, next?: GdsSegment): FlightSegment {
    return {
      segmentId: segment.segmentId,
      flightNumber: segment.flight.flightNumber,
      departure: {
        iataCode: segment.origin.code,
        at: formatLocalIso(segment.departureUtc, segment.origin.utcOffsetMinutes),
        terminal: TERMINALS[segment.origin.code] ?? null,
      },
      arrival: {
        iataCode: segment.destination.code,
        at: formatLocalIso(segment.arrivalUtc, segment.destination.utcOffsetMinutes),
        terminal: TERMINALS[segment.destination.code] ?? null,
      },
      ...(next ? { layoverMinutes: (next.departureUtc - segment.arrivalUtc) / 60_000 } : {}),
      marketingCarrier: AIRLINE.code,
      operatingCarrier: AIRLINE.code,
      aircraft: segment.flight.aircraft,
      durationMinutes: segment.durationMinutes,
      status: this.operationalState(segment).status,
    };
  }

  // ───────────────────────── inventario ─────────────────────────

  availableSeats(segmentId: string, cabinClass: string): number {
    const segment = this.resolveSegment(segmentId);
    if (!segment) return 0;
    const free = this.seatsOf(segment).filter(
      (seat) => seat.cabinClass === cabinClass && !this.isPreOccupied(segmentId, seat.seatNumber),
    ).length;
    return Math.max(0, free - (this.reserved.get(inventoryKey(segmentId, cabinClass)) ?? 0));
  }

  availableSeatsForItinerary(itinerary: GdsItinerary, cabinClass: string): number {
    return Math.min(...itinerary.segments.map((segment) => this.availableSeats(segment.segmentId, cabinClass)));
  }

  /** Retiene `count` cupos en todos los segmentos, o ninguno si alguno no tiene cupo suficiente. */
  reserve(segmentIds: string[], cabinClass: string, count: number): boolean {
    if (segmentIds.some((segmentId) => this.availableSeats(segmentId, cabinClass) < count)) {
      return false;
    }
    for (const segmentId of segmentIds) {
      const key = inventoryKey(segmentId, cabinClass);
      this.reserved.set(key, (this.reserved.get(key) ?? 0) + count);
    }
    return true;
  }

  release(segmentIds: string[], cabinClass: string, count: number): void {
    for (const segmentId of segmentIds) {
      const key = inventoryKey(segmentId, cabinClass);
      this.reserved.set(key, Math.max(0, (this.reserved.get(key) ?? 0) - count));
    }
  }

  // ───────────────────────── asientos ─────────────────────────

  seatMap(segmentId: string): GdsSeatMap | undefined {
    const segment = this.resolveSegment(segmentId);
    if (!segment) return undefined;
    return {
      segmentId,
      cabins: AIRCRAFT[segment.flight.aircraft].map((cabin) => ({
        cabinClass: cabin.cabinClass,
        rows: groupByRow(this.seatsOf(segment).filter((seat) => seat.cabinClass === cabin.cabinClass)).map(
          ([rowNumber, seats]) => ({
            rowNumber,
            seats: seats.map((seat) => ({
              seatNumber: seat.seatNumber,
              isAvailable: this.isSeatFree(segmentId, seat.seatNumber),
              characteristics: seat.characteristics,
            })),
          }),
        ),
      })),
    };
  }

  /** Datos de un asiento; `holder` indica a quién está asignado, si lo está. */
  seatInfo(segmentId: string, seatNumber: string): { cabinClass: CabinClass; isAvailable: boolean; holder?: string } | undefined {
    const segment = this.resolveSegment(segmentId);
    const seat = segment && this.seatsOf(segment).find((candidate) => candidate.seatNumber === seatNumber);
    if (!seat) return undefined;
    return {
      cabinClass: seat.cabinClass,
      isAvailable: this.isSeatFree(segmentId, seatNumber),
      holder: this.assignedSeats.get(segmentId)?.get(seatNumber),
    };
  }

  /** Asigna el asiento si está libre (o si ya es del mismo titular). */
  assignSeat(segmentId: string, seatNumber: string, holder: string): boolean {
    const info = this.seatInfo(segmentId, seatNumber);
    if (!info || (!info.isAvailable && info.holder !== holder)) return false;
    if (!this.assignedSeats.has(segmentId)) this.assignedSeats.set(segmentId, new Map());
    this.assignedSeats.get(segmentId)!.set(seatNumber, holder);
    return true;
  }

  releaseSeat(segmentId: string, seatNumber: string, holder: string): void {
    const seats = this.assignedSeats.get(segmentId);
    if (seats?.get(seatNumber) === holder) seats.delete(seatNumber);
  }

  firstAvailableSeat(segmentId: string, cabinClass: string): string | undefined {
    const segment = this.resolveSegment(segmentId);
    if (!segment) return undefined;
    return this.seatsOf(segment).find(
      (seat) => seat.cabinClass === cabinClass && this.isSeatFree(segmentId, seat.seatNumber),
    )?.seatNumber;
  }

  // ───────────────────────── estado operativo ─────────────────────────

  flightStatus(flightNumber: string, localDate: string): GdsFlightStatus | undefined {
    const segment = this.resolveSegment(buildSegmentId(flightNumber, localDate));
    if (!segment || Math.abs(segment.departureUtc - this.now()) > STATUS_WINDOW_DAYS * 86_400_000) {
      return undefined;
    }
    const state = this.operationalState(segment);
    const now = this.now();
    const endpoint = (airport: Airport, scheduled: number, estimated: number, reached: boolean): FlightEndpointStatus => ({
      iataCode: airport.code,
      terminal: TERMINALS[airport.code] ?? null,
      scheduledAt: formatLocalIso(scheduled, airport.utcOffsetMinutes),
      estimatedAt: formatLocalIso(estimated, airport.utcOffsetMinutes),
      actualAt: reached ? formatLocalIso(estimated, airport.utcOffsetMinutes) : null,
    });

    return {
      flightNumber,
      date: localDate,
      marketingCarrier: AIRLINE.code,
      operatingCarrier: AIRLINE.code,
      departure: endpoint(segment.origin, segment.departureUtc, state.estimatedDepartureUtc, now >= state.estimatedDepartureUtc),
      arrival: endpoint(segment.destination, segment.arrivalUtc, state.estimatedArrivalUtc, now >= state.estimatedArrivalUtc),
      aircraft: segment.flight.aircraft,
      status: state.status,
    };
  }

  // ───────────────────────── internos ─────────────────────────

  private buildSegment(flight: ScheduledFlight, localDate: string): GdsSegment {
    const origin = AIRPORTS[flight.origin]!;
    const destination = AIRPORTS[flight.destination]!;
    const distance = distanceKm(origin, destination);
    const durationMinutes = Math.round(((distance / 800) * 60 + 30) / 5) * 5;
    const departureUtc = localToUtcMs(localDate, flight.departureLocal, origin.utcOffsetMinutes);
    return {
      segmentId: buildSegmentId(flight.flightNumber, localDate),
      flight,
      origin,
      destination,
      localDate,
      departureUtc,
      arrivalUtc: departureUtc + durationMinutes * 60_000,
      durationMinutes,
      distanceKm: distance,
    };
  }

  private segmentsDeparting(origin: string, localDate: string, destination?: string): GdsSegment[] {
    return SCHEDULE.filter(
      (flight) => flight.origin === origin && (!destination || flight.destination === destination),
    ).map((flight) => this.buildSegment(flight, localDate));
  }

  /** Retraso determinista (~18 % de los vuelos, 20–69 min) y estado según la hora actual. */
  private operationalState(segment: GdsSegment) {
    const hash = stableHash(`delay:${segment.segmentId}`);
    const delayMinutes = hash % 100 < 18 ? 20 + (hash % 50) : 0;
    const estimatedDepartureUtc = segment.departureUtc + delayMinutes * 60_000;
    const estimatedArrivalUtc = segment.arrivalUtc + delayMinutes * 60_000;
    const now = this.now();

    let status: FlightOperationalStatus;
    if (now >= estimatedArrivalUtc) status = 'ARRIVED';
    else if (now >= estimatedDepartureUtc) status = 'DEPARTED';
    else if (now >= estimatedDepartureUtc - BOARDING_STARTS_MINUTES * 60_000) status = 'BOARDING';
    else status = delayMinutes > 0 ? 'DELAYED' : 'SCHEDULED';

    return { status, delayMinutes, estimatedDepartureUtc, estimatedArrivalUtc };
  }

  seatsOf(segment: GdsSegment): GdsSeat[] {
    const cached = this.seatLayoutCache.get(segment.flight.aircraft);
    if (cached) return cached;
    const seats = AIRCRAFT[segment.flight.aircraft].flatMap((cabin) => {
      const groups = cabin.layout.split('-');
      const windowLetters = new Set([groups[0]![0], groups.at(-1)!.at(-1)]);
      const aisleLetters = new Set(
        groups.flatMap((group, index) => [
          ...(index > 0 ? [group[0]] : []),
          ...(index < groups.length - 1 ? [group.at(-1)] : []),
        ]),
      );
      const letters = groups.join('').split('');
      const rows: GdsSeat[] = [];
      for (let row = cabin.firstRow; row <= cabin.lastRow; row++) {
        for (const letter of letters) {
          const characteristics: GdsSeat['characteristics'] = [];
          if (windowLetters.has(letter)) characteristics.push('WINDOW');
          if (aisleLetters.has(letter)) characteristics.push('AISLE');
          if (cabin.extraLegroomRows?.includes(row)) characteristics.push('EXTRA_LEGROOM');
          if (cabin.exitRows?.includes(row)) characteristics.push('EMERGENCY_EXIT');
          rows.push({ seatNumber: `${row}${letter}`, cabinClass: cabin.cabinClass, rowNumber: row, characteristics });
        }
      }
      return rows;
    });
    this.seatLayoutCache.set(segment.flight.aircraft, seats);
    return seats;
  }

  /** Ocupación inicial simulada (35–74 % según el vuelo): otros pasajeros que ya compraron. */
  private isPreOccupied(segmentId: string, seatNumber: string): boolean {
    const loadFactor = 35 + (stableHash(`load:${segmentId}`) % 40);
    return stableHash(`${segmentId}:${seatNumber}`) % 100 < loadFactor;
  }

  private isSeatFree(segmentId: string, seatNumber: string): boolean {
    return !this.isPreOccupied(segmentId, seatNumber) && !this.assignedSeats.get(segmentId)?.has(seatNumber);
  }
}

/**
 * Una conexión es válida si empalma en el mismo aeropuerto, la escala dura 1–10 h y no da un rodeo
 * absurdo: la distancia volada no puede superar MAX_DETOUR_FACTOR veces la distancia directa
 * (evita, p. ej., Quito → Madrid → Bogotá).
 */
function isValidConnection(first: GdsSegment, second: GdsSegment): boolean {
  const layover = (second.departureUtc - first.arrivalUtc) / 60_000;
  const direct = distanceKm(first.origin, second.destination);
  return (
    first.destination.code === second.origin.code &&
    first.origin.code !== second.destination.code &&
    layover >= MIN_LAYOVER_MINUTES &&
    layover <= MAX_LAYOVER_MINUTES &&
    first.distanceKm + second.distanceKm <= direct * MAX_DETOUR_FACTOR
  );
}

function toItinerary(segments: GdsSegment[]): GdsItinerary {
  return {
    itineraryId: buildItineraryId(segments.map((segment) => segment.segmentId)),
    segments,
    totalDurationMinutes: (segments.at(-1)!.arrivalUtc - segments[0]!.departureUtc) / 60_000,
    distanceKm: segments.reduce((total, segment) => total + segment.distanceKm, 0),
  };
}

function inventoryKey(segmentId: string, cabinClass: string): string {
  return `${segmentId}|${cabinClass}`;
}

function groupByRow(seats: GdsSeat[]): [number, GdsSeat[]][] {
  const rows = new Map<number, GdsSeat[]>();
  for (const seat of seats) {
    if (!rows.has(seat.rowNumber)) rows.set(seat.rowNumber, []);
    rows.get(seat.rowNumber)!.push(seat);
  }
  return [...rows.entries()];
}
