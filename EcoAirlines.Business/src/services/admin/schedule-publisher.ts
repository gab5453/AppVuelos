import { Inject, Injectable } from '@nestjs/common';
import type { FleetAircraftRecord } from '@ecoairlines/data-access/entities/admin/fleet-aircraft.entity.js';
import type { RouteDefinition } from '@ecoairlines/data-access/seed/timetable.js';
import { AIRCRAFT_REPOSITORY, type AircraftRepository } from '@ecoairlines/data-management/interfaces/admin/aircraft.repository.js';
import {
  FLIGHT_OPERATIONS_GATEWAY,
  type FlightOperationsGateway,
} from '@ecoairlines/data-management/interfaces/admin/flight-operations.gateway.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';

/**
 * Publica en el GDS el horario completo (rutas + flota) cuando cambia una ruta o un avión. Si el horario no se puede operar
 * responde 422 con los conflictos y nada cambia. Si se publica, guarda en la flota los aviones que el horario agregó solos
 * (rutas creadas sin elegir aviones) y devuelve los aviones de cada ruta.
 */
@Injectable()
export class SchedulePublisher {
  constructor(
    @Inject(FLIGHT_OPERATIONS_GATEWAY) private readonly operations: FlightOperationsGateway,
    @Inject(AIRCRAFT_REPOSITORY) private readonly aircraft: AircraftRepository,
  ) {}

  async publish(
    routes: readonly RouteDefinition[],
    fleet: readonly FleetAircraftRecord[],
    actor: string,
  ): Promise<Readonly<Record<string, readonly string[]>>> {
    const result = await this.operations.publishRoutes(routes, fleet);
    if (!result.ok) {
      throw new ProblemDetailsException({
        status: 422,
        code: 'VALIDATION_FAILED',
        title: 'El horario no se puede operar con este cambio.',
        detail: result.problems.slice(0, 5).join(' '),
        invalidParams: result.problems.slice(0, 5).map((reason) => ({ name: 'route', reason })),
      });
    }
    const known = new Set(fleet.map((plane) => plane.registration));
    const now = new Date().toISOString();
    for (const plane of result.fleet.filter((candidate) => !known.has(candidate.registration))) {
      await this.aircraft.save({ ...plane, source: 'ADMIN', createdAt: now, updatedAt: now, updatedBy: actor });
    }
    return result.aircraftByRoute;
  }
}
