import { Injectable } from '@nestjs/common';
import { MockGdsService, type GdsFlightStatus } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';
import type { FlightStatusGateway } from '../../interfaces/flight-status/flight-status.gateway.js';

/**
 * Gateway sobre el GDS simulado: el estado sale del mismo itinerario que usa la búsqueda, por lo que un
 * vuelo comprado siempre tiene estado consultable. Vuelos fuera del itinerario (o a más de ~1 año) no
 * existen → 404 FLIGHT_STATUS_NOT_AVAILABLE.
 */
@Injectable()
export class GdsFlightStatusGateway implements FlightStatusGateway {
  constructor(private readonly gds: MockGdsService) {}

  async getStatus(flightNumber: string, date: string): Promise<GdsFlightStatus | undefined> {
    return this.gds.flightStatus(flightNumber.toUpperCase(), date);
  }

  async localToday(flightNumber: string): Promise<string | undefined> {
    return this.gds.localToday(flightNumber.toUpperCase());
  }
}
