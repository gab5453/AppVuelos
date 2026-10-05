import { Injectable } from '@nestjs/common';
import { MockGdsService } from '../../../infrastructure/mock-gds/mock-gds.service.js';
import type { FlightStatusProviderPort } from '../domain/ports/flight-status-provider.port.js';
import type { FlightStatusDto } from '../presentation/dto/flight-status.dto.js';

/**
 * Adapter mock sobre el GDS simulado: el estado sale del mismo itinerario que usa la búsqueda,
 * por lo que un vuelo comprado siempre tiene estado consultable. Vuelos fuera del itinerario
 * (o a más de ~1 año) no existen → 404 FLIGHT_STATUS_NOT_AVAILABLE.
 */
@Injectable()
export class MockFlightStatusProviderAdapter implements FlightStatusProviderPort {
  constructor(private readonly gds: MockGdsService) {}

  async getStatus(flightNumber: string, date: string): Promise<FlightStatusDto | undefined> {
    return this.gds.flightStatus(flightNumber.toUpperCase(), date);
  }
}
