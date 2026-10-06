import { Inject, Injectable } from '@nestjs/common';
import { DomainEventBus } from '../../common/events/domain-event-bus.js';
import { AIRCRAFT_REPOSITORY, type AircraftRepository } from '@ecoairlines/data-management/interfaces/admin/aircraft.repository.js';
import { SchedulePublisher } from './schedule-publisher.js';
import type { ScheduledRouteRecord } from '@ecoairlines/data-access/entities/admin/scheduled-route.entity.js';
import { AIRPORTS, distanceKm } from '@ecoairlines/data-access/seed/airports.js';
import type { AircraftType } from '@ecoairlines/data-access/seed/network.js';
import { aircraftFor, flightDurationMinutes, type Weekday } from '@ecoairlines/data-access/seed/timetable.js';
import {
  FLIGHT_OPERATIONS_GATEWAY,
  type FlightOperationsGateway,
} from '@ecoairlines/data-management/interfaces/admin/flight-operations.gateway.js';
import {
  SCHEDULED_ROUTE_REPOSITORY,
  type ScheduledRouteRepository,
} from '@ecoairlines/data-management/interfaces/admin/scheduled-route.repository.js';
import {
  AIRCRAFT_TYPES,
  WEEKDAY_CODES,
  type RouteLegDto,
  type ScheduledRouteDto,
  type ScheduledRouteRequestDto,
} from '../../dto/admin/scheduled-route.dto.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';

/** Las rutas creadas por el administrador usan números desde EA300 (la red base va de EA100 a EA297). */
const FIRST_ADMIN_FLIGHT_NUMBER = 300;
const LAST_FLIGHT_NUMBER = 999;

/**
 * CRUD de **rutas programadas** (extensión fuera del contrato, dominio admin). Cada cambio:
 * 1. valida la ruta (aeropuertos, alcance del avión, días);
 * 2. si toca vuelos con pasajeros, se rechaza (409): para esos vuelos se usa el estado operativo (`CANCELLED`, `DELAYED`);
 * 3. publica en el GDS el horario completo con el cambio (rutas + flota), que asigna los aviones y comprueba que ninguno
 *    quede en dos lugares a la vez (422 con los conflictos si no se puede operar);
 * 4. solo entonces guarda la ruta con sus aviones. Así el horario publicado y las rutas guardadas nunca se separan.
 *
 * Aviones: si se eligen (`aircraft`), deben ser del tipo de la ruta, con base en el origen y alcanzar para los días; si no se
 * eligen, se usan los que ya tenía la ruta y se agregan aviones nuevos a la flota si faltan.
 */
@Injectable()
export class AdminRoutesService {
  constructor(
    @Inject(SCHEDULED_ROUTE_REPOSITORY) private readonly routes: ScheduledRouteRepository,
    @Inject(FLIGHT_OPERATIONS_GATEWAY) private readonly operations: FlightOperationsGateway,
    @Inject(AIRCRAFT_REPOSITORY) private readonly aircraft: AircraftRepository,
    private readonly publisher: SchedulePublisher,
    private readonly events: DomainEventBus,
  ) {}

  async list(filter: { airport?: string } = {}): Promise<ScheduledRouteDto[]> {
    const all = await this.routes.findAll();
    const selected = filter.airport ? all.filter((route) => route.origin === filter.airport || route.destination === filter.airport) : all;
    return Promise.all(selected.map((route) => this.toDto(route)));
  }

  async get(routeId: string): Promise<ScheduledRouteDto> {
    return this.toDto(await this.findOrFail(routeId));
  }

  async create(request: ScheduledRouteRequestDto, adminSub: string): Promise<ScheduledRouteDto> {
    const all = await this.routes.findAll();
    const fleet = await this.aircraft.findAll();
    const [outbound, inbound] = nextFlightNumbers(all);
    const now = new Date().toISOString();
    const route: ScheduledRouteRecord = {
      ...toDefinition(request, outbound, inbound, explicitType(request, fleet)),
      source: 'ADMIN',
      createdAt: now,
      updatedAt: now,
      updatedBy: adminSub,
    };
    assertNotDuplicated(route, all);
    const planned = { ...route, aircraft: request.aircraft ?? [], autoAddAircraft: !request.aircraft };
    const assigned = await this.publisher.publish([...all, planned], fleet, adminSub);
    route.aircraft = [...(assigned[route.routeId] ?? [])];
    await this.routes.save(route);
    this.publishScheduleChange('ROUTE_CREATED', route);
    return this.get(route.routeId);
  }

  async update(routeId: string, request: ScheduledRouteRequestDto, adminSub: string): Promise<ScheduledRouteDto> {
    const current = await this.findOrFail(routeId);
    await this.assertWithoutPassengers(current);
    const fleet = await this.aircraft.findAll();
    const route: ScheduledRouteRecord = {
      ...current,
      ...toDefinition(request, current.outbound.flightNumber, current.inbound.flightNumber, explicitType(request, fleet)),
      updatedAt: new Date().toISOString(),
      updatedBy: adminSub,
    };
    const all = await this.routes.findAll();
    assertNotDuplicated(route, all);
    // Sin aviones elegidos: conserva los que ya tenía (si siguen sirviendo) y agrega los que falten.
    const keep = (current.aircraft ?? []).filter((registration) => {
      const plane = fleet.find((candidate) => candidate.registration === registration);
      return plane?.aircraftType === route.aircraftType && plane.base === route.origin;
    });
    const planned = request.aircraft ? { ...route, aircraft: request.aircraft } : { ...route, aircraft: keep, autoAddAircraft: true };
    const assigned = await this.publisher.publish(
      all.map((candidate) => (candidate.routeId === routeId ? planned : candidate)),
      fleet,
      adminSub,
    );
    route.aircraft = [...(assigned[routeId] ?? [])];
    await this.routes.save(route);
    this.publishScheduleChange('ROUTE_UPDATED', route);
    return this.get(routeId);
  }

  async remove(routeId: string, adminSub: string): Promise<void> {
    const current = await this.findOrFail(routeId);
    await this.assertWithoutPassengers(current);
    const all = await this.routes.findAll();
    await this.publisher.publish(
      all.filter((candidate) => candidate.routeId !== routeId),
      await this.aircraft.findAll(),
      adminSub,
    );
    await this.routes.delete(routeId);
    this.publishScheduleChange('ROUTE_REMOVED', current);
  }

  /** Avisa a los suscriptores (p. ej. el booking central) que el horario publicado cambió. */
  private publishScheduleChange(action: 'ROUTE_CREATED' | 'ROUTE_UPDATED' | 'ROUTE_REMOVED', route: ScheduledRouteRecord): void {
    this.events.publish({
      eventType: 'flight.schedule_changed',
      data: {
        status: action,
        routeId: route.routeId,
        flightNumbers: [route.outbound.flightNumber, route.inbound.flightNumber],
        origin: route.origin,
        destination: route.destination,
        weekdays: route.weekdays.map((weekday) => WEEKDAY_CODES[weekday]),
      },
    });
  }

  private async findOrFail(routeId: string): Promise<ScheduledRouteRecord> {
    const route = await this.routes.findById(routeId);
    if (!route) throw new ProblemDetailsException({ status: 404, code: 'VALIDATION_FAILED', title: 'Ruta no encontrada.' });
    return route;
  }

  private async assertWithoutPassengers(route: ScheduledRouteRecord): Promise<void> {
    const seats = await this.customerSeats(route);
    if (seats > 0) {
      throw new ProblemDetailsException({
        status: 409,
        code: 'VALIDATION_FAILED',
        title: `La ruta ${route.routeId} tiene ${seats} cupo(s) vendidos o retenidos: no se puede modificar ni dar de baja.`,
        detail: 'Para un vuelo con pasajeros use el estado operativo (PUT /admin/flights/{flightNumber}/status), por ejemplo CANCELLED.',
        invalidParams: [{ name: 'routeId', reason: 'route has customer seats' }],
      });
    }
  }

  private async customerSeats(route: ScheduledRouteRecord): Promise<number> {
    const [outbound, inbound] = await Promise.all([
      this.operations.customerSeatsOn(route.outbound.flightNumber),
      this.operations.customerSeatsOn(route.inbound.flightNumber),
    ]);
    return outbound + inbound;
  }

  private async toDto(route: ScheduledRouteRecord): Promise<ScheduledRouteDto> {
    const durationMinutes = flightDurationMinutes(route.origin, route.destination);
    return {
      routeId: route.routeId,
      origin: route.origin,
      destination: route.destination,
      outbound: leg(route.outbound.flightNumber, route.origin, route.destination, route.outbound.departureLocal, durationMinutes),
      inbound: leg(route.inbound.flightNumber, route.destination, route.origin, route.inbound.departureLocal, durationMinutes),
      weekdays: route.weekdays.map((weekday) => WEEKDAY_CODES[weekday]!),
      aircraftType: route.aircraftType,
      aircraft: [...(route.aircraft ?? [])],
      distanceKm: Math.round(distanceKm(AIRPORTS[route.origin]!, AIRPORTS[route.destination]!)),
      durationMinutes,
      customerSeats: await this.customerSeats(route),
      source: route.source,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
  }
}

/** Valida la ruta pedida y la convierte en la definición que entiende el horario. */
/** Tipo de avión de la ruta: el pedido o, si se eligieron aviones, el del primero. */
function explicitType(request: ScheduledRouteRequestDto, fleet: { registration: string; aircraftType: AircraftType }[]): AircraftType | undefined {
  if (request.aircraftType) return request.aircraftType;
  const first = request.aircraft?.[0];
  const plane = first ? fleet.find((candidate) => candidate.registration === first) : undefined;
  if (first && !plane) {
    throw new ProblemDetailsException({
      status: 422,
      code: 'VALIDATION_FAILED',
      title: `El avión ${first} no está en la flota.`,
      invalidParams: [{ name: 'aircraft', reason: `unknown registration ${first}` }],
    });
  }
  return plane?.aircraftType;
}

function toDefinition(request: ScheduledRouteRequestDto, outbound: string, inbound: string, chosenType?: AircraftType) {
  const origin = AIRPORTS[request.origin];
  const destination = AIRPORTS[request.destination];
  if (!origin || !destination) {
    const name = origin ? 'destination' : 'origin';
    throw new ProblemDetailsException({
      status: 422,
      code: 'VALIDATION_FAILED',
      title: 'EcoAirlines no opera en ese aeropuerto.',
      invalidParams: [{ name, reason: `must be one of ${Object.keys(AIRPORTS).join(', ')}` }],
    });
  }
  if (origin.code === destination.code) {
    throw new ProblemDetailsException({
      status: 422,
      code: 'VALIDATION_FAILED',
      title: 'El origen y el destino deben ser distintos.',
      invalidParams: [{ name: 'destination', reason: 'must differ from origin' }],
    });
  }
  const distance = distanceKm(origin, destination);
  const required = aircraftFor(distance);
  const aircraftType = chosenType ?? required;
  if (AIRCRAFT_TYPES.indexOf(aircraftType) < AIRCRAFT_TYPES.indexOf(required)) {
    throw new ProblemDetailsException({
      status: 422,
      code: 'VALIDATION_FAILED',
      title: `El ${aircraftType} no tiene alcance para ${Math.round(distance)} km: use ${required} o uno mayor.`,
      invalidParams: [{ name: 'aircraftType', reason: `minimum ${required}` }],
    });
  }
  return {
    routeId: `${outbound}-${inbound}`,
    origin: origin.code,
    destination: destination.code,
    outbound: { flightNumber: outbound, departureLocal: request.outboundDepartureLocal },
    inbound: { flightNumber: inbound, departureLocal: request.inboundDepartureLocal },
    weekdays: [...new Set(request.weekdays.map((code) => WEEKDAY_CODES.indexOf(code) as Weekday))].sort((a, b) => a - b),
    aircraftType: aircraftType as AircraftType,
  };
}

/** Dos vuelos de la misma ruta y sentido a la misma hora serían el mismo vuelo duplicado: se rechaza (409). */
function assertNotDuplicated(route: RouteDefinitionLike, all: ScheduledRouteRecord[]): void {
  const legs = (candidate: RouteDefinitionLike) => [
    { flightNumber: candidate.outbound.flightNumber, from: candidate.origin, to: candidate.destination, at: candidate.outbound.departureLocal },
    { flightNumber: candidate.inbound.flightNumber, from: candidate.destination, to: candidate.origin, at: candidate.inbound.departureLocal },
  ];
  for (const other of all.filter((candidate) => candidate.routeId !== route.routeId)) {
    for (const mine of legs(route)) {
      const clash = legs(other).find((leg) => leg.from === mine.from && leg.to === mine.to && leg.at === mine.at);
      if (clash) {
        throw new ProblemDetailsException({
          status: 409,
          code: 'VALIDATION_FAILED',
          title: `Ya existe el vuelo ${clash.flightNumber} ${mine.from} → ${mine.to} a las ${mine.at} (ruta ${other.routeId}).`,
          invalidParams: [{ name: 'route', reason: `duplicates ${clash.flightNumber}` }],
        });
      }
    }
  }
}

type RouteDefinitionLike = Pick<ScheduledRouteRecord, 'routeId' | 'origin' | 'destination' | 'outbound' | 'inbound'>;

/** Los dos primeros números de vuelo libres desde EA300. */
function nextFlightNumbers(routes: ScheduledRouteRecord[]): [string, string] {
  const used = new Set(routes.flatMap((route) => [route.outbound.flightNumber, route.inbound.flightNumber]));
  const free: string[] = [];
  for (let number = FIRST_ADMIN_FLIGHT_NUMBER; number <= LAST_FLIGHT_NUMBER && free.length < 2; number++) {
    if (!used.has(`EA${number}`)) free.push(`EA${number}`);
  }
  if (free.length < 2) {
    throw new ProblemDetailsException({ status: 409, code: 'VALIDATION_FAILED', title: 'No quedan números de vuelo disponibles (EA300–EA999).' });
  }
  return [free[0]!, free[1]!];
}

/** Tramo con su hora de llegada local (la de su destino). */
function leg(flightNumber: string, origin: string, destination: string, departureLocal: string, durationMinutes: number): RouteLegDto {
  const [hours, minutes] = departureLocal.split(':').map(Number) as [number, number];
  const offsetDifference = AIRPORTS[destination]!.utcOffsetMinutes - AIRPORTS[origin]!.utcOffsetMinutes;
  const arrival = hours * 60 + minutes + durationMinutes + offsetDifference;
  const dayOffset = Math.floor(arrival / 1440);
  const inDay = ((arrival % 1440) + 1440) % 1440;
  return {
    flightNumber,
    origin,
    destination,
    departureLocal,
    arrivalLocal: `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`,
    arrivalDayOffset: dayOffset,
  };
}
