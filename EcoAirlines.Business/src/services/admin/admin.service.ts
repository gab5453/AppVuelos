import { Inject, Injectable } from '@nestjs/common';
import { DomainEventBus } from '../../common/events/domain-event-bus.js';
import type { PassengerItem } from '@ecoairlines/data-access/common/contract/common.types.js';
import { formatCents, toCents } from '@ecoairlines/data-access/common/money.js';
import {
  FLIGHT_OPERATIONS_GATEWAY,
  type FlightOperationsGateway,
} from '@ecoairlines/data-management/interfaces/admin/flight-operations.gateway.js';
import type {
  AdminDashboardStatsDto,
  DomainEventDto,
  FleetScheduleDto,
  FlightOccupancyDto,
  RouteStatDto,
} from '../../dto/admin/admin.dto.js';
import type { FlightStatusDto } from '../../dto/flight-status/flight-status.dto.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { BookingsFacade, toDetail, type BookingSnapshot } from '../bookings/bookings.facade.js';
import { FlightStatusService } from '../flight-status/flight-status.service.js';
import type { FlightOperationalStatus } from '@ecoairlines/data-access/common/contract/common.types.js';

/** Desfase de la base de operaciones (Quito, UTC−5) para definir "hoy" en el panel. */
const HOME_UTC_OFFSET_MINUTES = -300;
const RECENT_BOOKINGS = 15;

/**
 * Dominio **admin** (extensión fuera del contrato). No tiene datos propios: lee las reservas mediante
 * `BookingsFacade`, el estado de los vuelos mediante `FlightStatusService` y la ocupación del GDS con su
 * propio gateway. Implementa las funciones de la plantilla del grupo con datos reales.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly bookings: BookingsFacade,
    private readonly flightStatus: FlightStatusService,
    @Inject(FLIGHT_OPERATIONS_GATEWAY) private readonly operations: FlightOperationsGateway,
    private readonly events: DomainEventBus,
  ) {}

  async getDashboardStats(): Promise<AdminDashboardStatsDto> {
    const bookings = await this.bookings.listAll();
    const confirmed = bookings.filter((booking) => booking.status === 'CONFIRMED');
    const flightOccupancies = await this.getFlights({});

    const routeStats: RouteStatDto[] = (await this.operations.routes())
      .map((route) => {
        const routeBookings = confirmed.filter((booking) => {
          const [origin, destination] = endpoints(booking);
          return origin !== undefined && [origin, destination].sort().join('-') === route.airports.join('-');
        });
        return {
          route: route.label,
          flightsCount: route.dailyFlights,
          bookingsCount: routeBookings.length,
          totalRevenue: revenue(routeBookings),
        };
      })
      .sort((a, b) => b.bookingsCount - a.bookingsCount || a.route.localeCompare(b.route));

    return {
      totalBookings: bookings.length,
      confirmedBookings: confirmed.length,
      cancelledBookings: bookings.filter((booking) => booking.status === 'CANCELLED').length,
      totalPassengers: confirmed.reduce((total, booking) => total + (booking.passengers?.length ?? 0), 0),
      totalRevenue: revenue(confirmed),
      totalFlightsToday: flightOccupancies.length,
      routeStats,
      flightOccupancies,
      recentBookings: bookings.slice(0, RECENT_BOOKINGS).map(toDetail),
    };
  }

  /**
   * Ocupación de los vuelos de una fecha (por defecto hoy en Quito), opcionalmente de un aeropuerto de origen o de una ruta.
   * Sirve para observar cómo se reservan los asientos de cualquier día publicado; más allá de los 91 días responde 400.
   */
  async getFlights(query: { date?: string; origin?: string; destination?: string }): Promise<FlightOccupancyDto[]> {
    const date = query.date ?? homeToday();
    const lastDate = await this.operations.salesWindowEnd();
    if (date > lastDate) {
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: `El horario publicado llega hasta el ${lastDate}.`,
        invalidParams: [{ name: 'date', reason: `must be on or before ${lastDate}` }],
      });
    }
    const flights = (await this.operations.flightsOn(date)).filter(
      (flight) => (!query.origin || flight.origin === query.origin) && (!query.destination || flight.destination === query.destination),
    );

    const result: FlightOccupancyDto[] = [];
    for (const flight of flights) {
      const status = await this.flightStatus.findStatus(flight.flightNumber, flight.date);
      const bookedSeats = flight.totalSeats - flight.availableSeats;
      result.push({
        flightId: flight.flightId,
        flightNumber: flight.flightNumber,
        route: `${flight.origin} ✈ ${flight.destination}`,
        scheduledDeparture: flight.scheduledDeparture,
        status: status?.status ?? 'SCHEDULED',
        totalSeats: flight.totalSeats,
        bookedSeats,
        availableSeats: flight.availableSeats,
        occupancyPercentage: flight.totalSeats ? Math.round((bookedSeats / flight.totalSeats) * 1000) / 10 : 0,
        date: flight.date,
        reservedSeats: flight.reservedSeats,
        simulatedSeats: flight.simulatedSeats,
      });
    }
    return result;
  }

  async updateFlightStatus(
    flightNumber: string,
    status: FlightOperationalStatus,
    adminId: string,
    date?: string,
  ): Promise<FlightStatusDto> {
    const updated = await this.flightStatus.setOperationalStatus(flightNumber, date ?? (await this.today(flightNumber)), status, adminId);
    this.events.publish({
      eventType: status === 'CANCELLED' ? 'flight.cancelled' : 'flight.schedule_changed',
      data: { flightNumber: updated.flightNumber, date: updated.date, status: updated.status },
    });
    return updated;
  }

  /** Últimos eventos del bus interno con sus entregas (webhooks). No incluye el dueño de cada reserva. */
  getRecentEvents(): DomainEventDto[] {
    return this.events.recent().map(({ ownerId: _ownerId, ...event }) => event);
  }

  /**
   * Rotación de la flota en una fecha (por defecto, hoy en Quito). Se puede consultar el pasado y el horario publicado
   * (ventana de venta de 91 días); más adelante todavía no hay vuelos programados.
   */
  async getFleetSchedule(date?: string): Promise<FleetScheduleDto> {
    const schedule = await this.operations.fleetSchedule(date ?? homeToday());
    if (schedule.date > schedule.salesWindow.to) {
      throw new ProblemDetailsException({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: `El horario publicado llega hasta el ${schedule.salesWindow.to}.`,
        invalidParams: [{ name: 'date', reason: `must be on or before ${schedule.salesWindow.to}` }],
      });
    }
    return schedule;
  }

  /** Pasajeros de reservas confirmadas que vuelan ese vuelo en esa fecha, con su asiento en ese vuelo. */
  async getFlightPassengers(flightNumber: string, date?: string): Promise<PassengerItem[]> {
    const segmentId = await this.operations.segmentIdFor(flightNumber, date ?? (await this.today(flightNumber)));
    if (!segmentId) throw flightNotFound();

    const passengers: PassengerItem[] = [];
    for (const booking of await this.bookings.listAll()) {
      if (booking.status !== 'CONFIRMED') continue;
      const fare = booking.fares.find((candidate) => candidate.segmentIds.includes(segmentId));
      if (!fare) continue;
      for (const passenger of booking.passengers ?? []) {
        passengers.push({
          ...passenger,
          assignedSeats: passenger.assignedSeats?.filter((seat) => seat.segmentId === segmentId) ?? [],
          extraBaggage: passenger.extraBaggage?.filter((bag) => bag.itineraryId === fare.itineraryId) ?? [],
        });
      }
    }
    return passengers;
  }

  private async today(flightNumber: string): Promise<string> {
    const today = await this.flightStatus.localToday(flightNumber);
    if (!today) throw flightNotFound();
    return today;
  }
}

/** Hoy en la base de operaciones (Quito, UTC−5). */
function homeToday(): string {
  return new Date(Date.now() + HOME_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Origen y destino del primer itinerario de la reserva. */
function endpoints(booking: BookingSnapshot): [string | undefined, string | undefined] {
  const segments = booking.itineraries?.[0]?.segments ?? [];
  return [segments[0]?.departure.iataCode, segments.at(-1)?.arrival.iataCode];
}

/** Suma de `grandTotal` (los importes del contrato son strings decimales) como número, igual que en la plantilla. */
function revenue(bookings: BookingSnapshot[]): number {
  return Number(formatCents(bookings.reduce((total, booking) => total + toCents(booking.grandTotal.total), 0)));
}

function flightNotFound(): ProblemDetailsException {
  return ProblemDetailsException.notFound('El vuelo no existe en la red de EcoAirlines.', 'FLIGHT_STATUS_NOT_AVAILABLE');
}
