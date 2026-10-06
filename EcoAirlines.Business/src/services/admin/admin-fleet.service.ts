import { Inject, Injectable } from '@nestjs/common';
import type { FleetAircraftRecord } from '@ecoairlines/data-access/entities/admin/fleet-aircraft.entity.js';
import { AIRPORTS } from '@ecoairlines/data-access/seed/airports.js';
import { AIRCRAFT, type AircraftType } from '@ecoairlines/data-access/seed/network.js';
import {
  AIRCRAFT_MAX_ROUTE_KM,
  REGISTRATION_PREFIX,
  TURNAROUND_MINUTES,
  nextRegistration,
} from '@ecoairlines/data-access/seed/timetable.js';
import { AIRCRAFT_REPOSITORY, type AircraftRepository } from '@ecoairlines/data-management/interfaces/admin/aircraft.repository.js';
import {
  SCHEDULED_ROUTE_REPOSITORY,
  type ScheduledRouteRepository,
} from '@ecoairlines/data-management/interfaces/admin/scheduled-route.repository.js';
import type {
  AircraftDto,
  AircraftRequestDto,
  AircraftTypeDto,
  UpdateAircraftRequestDto,
} from '../../dto/admin/fleet.dto.js';
import { AIRCRAFT_TYPES } from '../../dto/admin/scheduled-route.dto.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import { SchedulePublisher } from './schedule-publisher.js';

/** Asientos por cabina de un tipo de avión, según su mapa de asientos. */
function seatsOf(aircraftType: AircraftType): { cabinClass: string; seats: number }[] {
  return AIRCRAFT[aircraftType].map((cabin) => ({
    cabinClass: cabin.cabinClass,
    seats: (cabin.lastRow - cabin.firstRow + 1) * cabin.layout.replace(/-/g, '').length,
  }));
}

const totalSeats = (aircraftType: AircraftType) => seatsOf(aircraftType).reduce((sum, cabin) => sum + cabin.seats, 0);

/**
 * CRUD de la **flota** (extensión fuera del contrato, dominio admin).
 * - Alta: el administrador elige tipo y base; la matrícula se asigna sola (la siguiente libre del tipo). El avión queda
 *   disponible para asignarlo a rutas (`aircraft` en `POST/PUT /admin/routes`).
 * - Cambio de base y baja: solo si el avión no opera ninguna ruta (409): primero se quita de sus rutas.
 * - Los tipos de avión son datos maestros (mapa de asientos, alcance, tiempo en tierra): se consultan, no se editan.
 * Cada cambio vuelve a publicar el horario en el GDS, así la vista de la flota muestra el avión al instante.
 */
@Injectable()
export class AdminFleetService {
  constructor(
    @Inject(AIRCRAFT_REPOSITORY) private readonly aircraft: AircraftRepository,
    @Inject(SCHEDULED_ROUTE_REPOSITORY) private readonly routes: ScheduledRouteRepository,
    private readonly publisher: SchedulePublisher,
  ) {}

  async listTypes(): Promise<AircraftTypeDto[]> {
    const fleet = await this.aircraft.findAll();
    return AIRCRAFT_TYPES.map((aircraftType) => ({
      aircraftType,
      registrationPrefix: REGISTRATION_PREFIX[aircraftType],
      seats: seatsOf(aircraftType),
      totalSeats: totalSeats(aircraftType),
      maxRouteKm: AIRCRAFT_MAX_ROUTE_KM[aircraftType],
      turnaroundMinutes: TURNAROUND_MINUTES[aircraftType],
      inFleet: fleet.filter((plane) => plane.aircraftType === aircraftType).length,
    }));
  }

  async list(filter: { base?: string; aircraftType?: AircraftType } = {}): Promise<AircraftDto[]> {
    const routesByAircraft = await this.routesByAircraft();
    return (await this.aircraft.findAll())
      .filter((plane) => (!filter.base || plane.base === filter.base) && (!filter.aircraftType || plane.aircraftType === filter.aircraftType))
      .map((plane) => toDto(plane, routesByAircraft.get(plane.registration) ?? []));
  }

  async get(registration: string): Promise<AircraftDto> {
    const plane = await this.findOrFail(registration);
    return toDto(plane, (await this.routesByAircraft()).get(registration) ?? []);
  }

  async create(request: AircraftRequestDto, adminSub: string): Promise<AircraftDto> {
    assertAirport(request.base);
    const fleet = await this.aircraft.findAll();
    const used = new Set(fleet.map((plane) => plane.registration));
    let sequence = 1;
    while (used.has(nextRegistration(request.aircraftType, sequence))) sequence++;
    const now = new Date().toISOString();
    const plane: FleetAircraftRecord = {
      registration: nextRegistration(request.aircraftType, sequence),
      aircraftType: request.aircraftType,
      base: request.base,
      source: 'ADMIN',
      createdAt: now,
      updatedAt: now,
      updatedBy: adminSub,
    };
    await this.publisher.publish(await this.routes.findAll(), [...fleet, plane], adminSub);
    await this.aircraft.save(plane);
    return toDto(plane, []);
  }

  async update(registration: string, request: UpdateAircraftRequestDto, adminSub: string): Promise<AircraftDto> {
    const current = await this.findOrFail(registration);
    assertAirport(request.base);
    await this.assertAvailable(current, 'cambiar de base');
    const plane: FleetAircraftRecord = { ...current, base: request.base, updatedAt: new Date().toISOString(), updatedBy: adminSub };
    const fleet = (await this.aircraft.findAll()).map((candidate) => (candidate.registration === registration ? plane : candidate));
    await this.publisher.publish(await this.routes.findAll(), fleet, adminSub);
    await this.aircraft.save(plane);
    return toDto(plane, []);
  }

  async remove(registration: string, adminSub: string): Promise<void> {
    const current = await this.findOrFail(registration);
    await this.assertAvailable(current, 'retirar');
    const fleet = (await this.aircraft.findAll()).filter((candidate) => candidate.registration !== registration);
    await this.publisher.publish(await this.routes.findAll(), fleet, adminSub);
    await this.aircraft.delete(registration);
  }

  private async findOrFail(registration: string): Promise<FleetAircraftRecord> {
    const plane = await this.aircraft.findById(registration.toUpperCase());
    if (!plane) throw new ProblemDetailsException({ status: 404, code: 'VALIDATION_FAILED', title: 'Avión no encontrado.' });
    return plane;
  }

  private async assertAvailable(plane: FleetAircraftRecord, action: string): Promise<void> {
    const routes = (await this.routesByAircraft()).get(plane.registration) ?? [];
    if (routes.length > 0) {
      throw new ProblemDetailsException({
        status: 409,
        code: 'VALIDATION_FAILED',
        title: `No se puede ${action} ${plane.registration}: opera ${routes.length} ruta(s) (${routes.slice(0, 3).join(', ')}).`,
        detail: 'Primero asigne otros aviones a esas rutas (PUT /admin/routes/{routeId} con "aircraft") o déles de baja.',
        invalidParams: [{ name: 'registration', reason: 'aircraft is assigned to routes' }],
      });
    }
  }

  private async routesByAircraft(): Promise<Map<string, string[]>> {
    const byAircraft = new Map<string, string[]>();
    for (const route of await this.routes.findAll()) {
      for (const registration of route.aircraft ?? []) {
        byAircraft.set(registration, [...(byAircraft.get(registration) ?? []), route.routeId]);
      }
    }
    return byAircraft;
  }
}

function assertAirport(code: string): void {
  if (!AIRPORTS[code]) {
    throw new ProblemDetailsException({
      status: 422,
      code: 'VALIDATION_FAILED',
      title: 'EcoAirlines no opera en ese aeropuerto.',
      invalidParams: [{ name: 'base', reason: `must be one of ${Object.keys(AIRPORTS).join(', ')}` }],
    });
  }
}

function toDto(plane: FleetAircraftRecord, routes: string[]): AircraftDto {
  return {
    registration: plane.registration,
    aircraftType: plane.aircraftType,
    base: plane.base,
    status: routes.length > 0 ? 'IN_SERVICE' : 'AVAILABLE',
    routes,
    totalSeats: totalSeats(plane.aircraftType),
    source: plane.source,
    createdAt: plane.createdAt,
    updatedAt: plane.updatedAt,
  };
}
