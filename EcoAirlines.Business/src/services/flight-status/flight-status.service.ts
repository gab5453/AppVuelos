import { Inject, Injectable } from '@nestjs/common';
import type { FlightOperationalStatus } from '@ecoairlines/data-access/common/contract/common.types.js';
import {
  FLIGHT_STATUS_OVERRIDE_REPOSITORY,
  type FlightStatusOverrideRepository,
} from '@ecoairlines/data-management/interfaces/flight-status/flight-status-override.repository.js';
import {
  FLIGHT_STATUS_GATEWAY,
  type FlightStatusGateway,
} from '@ecoairlines/data-management/interfaces/flight-status/flight-status.gateway.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';
import type { FlightStatusDto } from '../../dto/flight-status/flight-status.dto.js';

/**
 * Estado operativo de los vuelos. Parte del GDS y, si un administrador registró un ajuste para ese vuelo
 * y fecha (`PUT /admin/flights/{flightNumber}/status`), lo aplica encima. Es la API pública del dominio
 * flight-status para el dominio admin.
 */
@Injectable()
export class FlightStatusService {
  constructor(
    @Inject(FLIGHT_STATUS_GATEWAY) private readonly gateway: FlightStatusGateway,
    @Inject(FLIGHT_STATUS_OVERRIDE_REPOSITORY) private readonly overrides: FlightStatusOverrideRepository,
  ) {}

  async getStatus(flightNumber: string, date: string): Promise<FlightStatusDto> {
    const status = await this.findStatus(flightNumber, date);
    if (!status) {
      throw ProblemDetailsException.notFound(
        'No hay información de estado para ese vuelo y fecha.',
        'FLIGHT_STATUS_NOT_AVAILABLE',
      );
    }
    return status;
  }

  /** Estado del vuelo, o `undefined` si no existe (sin lanzar error). */
  async findStatus(flightNumber: string, date: string): Promise<FlightStatusDto | undefined> {
    const status = await this.gateway.getStatus(flightNumber, date);
    if (!status) return undefined;
    const override = await this.overrides.find(status.flightNumber, date);
    if (!override) return status;
    return {
      ...status,
      status: override.status,
      departure: { ...status.departure, actualAt: override.actualDepartureAt ?? status.departure.actualAt },
      arrival: { ...status.arrival, actualAt: override.actualArrivalAt ?? status.arrival.actualAt },
    };
  }

  /** Fecha local de hoy en el origen del vuelo (o `undefined` si el vuelo no existe). */
  localToday(flightNumber: string): Promise<string | undefined> {
    return this.gateway.localToday(flightNumber);
  }

  /**
   * Registra el estado que decide un administrador. Como en la plantilla del grupo, DEPARTED y ARRIVED
   * guardan además la hora real de salida o de llegada.
   */
  async setOperationalStatus(
    flightNumber: string,
    date: string,
    status: FlightOperationalStatus,
    adminId: string,
  ): Promise<FlightStatusDto> {
    const current = await this.findStatus(flightNumber, date);
    if (!current) {
      throw ProblemDetailsException.notFound('Vuelo no encontrado para actualizar su estado.', 'FLIGHT_STATUS_NOT_AVAILABLE');
    }
    const previous = await this.overrides.find(current.flightNumber, date);
    const now = new Date().toISOString();
    await this.overrides.save({
      flightNumber: current.flightNumber,
      date,
      status,
      actualDepartureAt: status === 'DEPARTED' ? now : previous?.actualDepartureAt,
      actualArrivalAt: status === 'ARRIVED' ? now : previous?.actualArrivalAt,
      updatedAt: now,
      updatedBy: adminId,
    });
    return (await this.findStatus(flightNumber, date))!;
  }
}
